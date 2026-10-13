// Función programada (netlify.toml, `schedule`): reemplaza el cron diario de
// `vercel.json`. Llama a /health, que consulta la base, para que la API y el
// proyecto de Supabase Free no queden inactivos (pausa a los 7 días).
// `URL` la define Netlify con la dirección principal del sitio.
export default async () => {
  const res = await fetch(`${process.env.URL}/health`);
  console.log('keepalive /health', res.status);
};
