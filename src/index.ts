import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get("/health", (c) => 
  c.json({ ok: true }
));

export default {
  port: Number(process.env.PORT),
  fetch: app.fetch,
};
