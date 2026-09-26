import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../audit/audit.writer";
import type { AuthUser } from "../auth/auth.select";
import { assertInternalTaskAccess } from "../tasks/task.access";
import { taskScope } from "../tasks/task.policy";
import {
	ALLOWED_MIME_TYPES,
	MAX_ATTACHMENT_BYTES,
	normalizeMimeType,
	sanitizeFileName,
} from "./attachment.config";

const attachmentSelect = {
	id: true,
	taskId: true,
	fileName: true,
	mimeType: true,
	sizeBytes: true,
	createdAt: true,
	uploadedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.AttachmentSelect;

const notFound = () => new AppError(404, "NOT_FOUND", "Attachment not found");

function accessibleAttachmentWhere(
	user: AuthUser,
	id: string,
): Prisma.AttachmentWhereInput {
	return { id, deletedAt: null, task: taskScope(user) };
}

export async function listAttachments(user: AuthUser, taskId: string) {
	await assertInternalTaskAccess(user, taskId);
	return prisma.attachment.findMany({
		where: { taskId, deletedAt: null },
		select: attachmentSelect,
		orderBy: { createdAt: "desc" },
	});
}

export async function uploadAttachment(
	user: AuthUser,
	taskId: string,
	file: File,
) {
	const { projectId } = await assertInternalTaskAccess(user, taskId);

	if (file.size === 0) throw new AppError(400, "EMPTY_FILE", "File is empty");
	if (file.size > MAX_ATTACHMENT_BYTES) {
		throw new AppError(
			413,
			"FILE_TOO_LARGE",
			`Maximum file size is ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
		);
	}
	const mimeType = normalizeMimeType(file.type);
	if (!ALLOWED_MIME_TYPES.has(mimeType)) {
		throw new AppError(
			415,
			"UNSUPPORTED_FILE_TYPE",
			"File type is not supported",
		);
	}

	const fileName = sanitizeFileName(file.name);
	const data = new Uint8Array(await file.arrayBuffer());

	return prisma.$transaction(async (tx) => {
		const attachment = await tx.attachment.create({
			data: {
				taskId,
				uploadedById: user.id,
				fileName,
				mimeType,
				sizeBytes: file.size,
				blob: { create: { data } },
			},
			select: attachmentSelect,
		});
		await writeAudit(tx, { taskId, projectId, userId: user.id }, [
			{ changedColumn: "attachment", oldValue: null, newValue: fileName },
		]);
		return attachment;
	});
}

export async function downloadAttachment(user: AuthUser, id: string) {
	if (user.role === "CLIENT") throw notFound();

	const attachment = await prisma.attachment.findFirst({
		where: accessibleAttachmentWhere(user, id),
		select: {
			fileName: true,
			mimeType: true,
			blob: { select: { data: true } },
		},
	});
	if (!attachment?.blob) throw notFound();
	return {
		fileName: attachment.fileName,
		mimeType: attachment.mimeType,
		data: attachment.blob.data,
	};
}

export async function deleteAttachment(
	user: AuthUser,
	id: string,
): Promise<void> {
	if (user.role === "CLIENT") throw notFound();

	await prisma.$transaction(async (tx) => {
		const attachment = await tx.attachment.findFirst({
			where: accessibleAttachmentWhere(user, id),
			select: {
				taskId: true,
				fileName: true,
				uploadedById: true,
				task: { select: { projectId: true } },
			},
		});
		if (!attachment) throw notFound();
		if (user.role !== "PM" && attachment.uploadedById !== user.id) {
			throw new AppError(
				403,
				"FORBIDDEN",
				"Only the uploader or PM can delete the attachment",
			);
		}

		await tx.attachment.update({
			where: { id },
			data: { deletedAt: new Date() },
		});
		await writeAudit(
			tx,
			{
				taskId: attachment.taskId,
				projectId: attachment.task.projectId,
				userId: user.id,
			},
			[
				{
					changedColumn: "attachment",
					oldValue: attachment.fileName,
					newValue: null,
				},
			],
		);
	});
}
