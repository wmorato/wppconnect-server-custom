import express from 'express';
import cors from 'cors';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 5300;

app.use(
  cors({
    origin: ['https://painel.moratosolucoes.com.br'],
    credentials: true,
  })
);

app.use(express.json());

// ✅ Adiciona as rotas corretamente
app.use(routes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});

export default app;
