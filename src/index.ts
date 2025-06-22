// src/index.ts

import { defaultLogger } from '@wppconnect-team/wppconnect';
import cors from 'cors';
import express, { Express, NextFunction, Router } from 'express';
import boolParser from 'express-query-boolean';
import { createServer } from 'http';
import mergeDeep from 'merge-deep';
import process from 'process';
import { Server as Socket } from 'socket.io';
import { Logger } from 'winston';

import { version } from '../package.json';
import config from './config';
import { convert } from './mapper/index';
import routes from './routes';
import { ServerOptions } from './types/ServerOptions';
import {
  createFolders,
  setMaxListners,
  startAllSessions,
} from './util/functions';
import { createLogger } from './util/logger';

// require('dotenv').config(); // Descomente se você usa variáveis de ambiente via .env

export const logger = createLogger(config.log);

console.log('--- Início de initServer ---');
console.log('config importado no escopo global:', config);

export function initServer(serverOptionsParam: Partial<ServerOptions>): {
  app: Express;
  routes: Router;
  logger: Logger;
} {
  console.log('initServer chamado com serverOptionsParam:', serverOptionsParam);

  const serverOptions: ServerOptions = mergeDeep(
    {},
    config,
    serverOptionsParam
  ) as ServerOptions;

  console.log('serverOptions após mergeDeep:', serverOptions);
  console.log(
    'secretKey no serverOptions (DEVE SER DEFINIDO):',
    serverOptions.secretKey
  );

  defaultLogger.level = serverOptions?.log?.level
    ? serverOptions.log.level
    : 'silly';

  setMaxListners(serverOptions);

  const app = express();
  const PORT = process.env.PORT || serverOptions.port;

  app.use(
    cors({
      origin: ['https://painel.moratosolucoes.com.br'],
      credentials: true,
    })
  );
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use('/files', express.static('WhatsAppImages'));
  app.use(boolParser());

  if (config?.aws_s3?.access_key_id && config?.aws_s3?.secret_key) {
    process.env['AWS_ACCESS_KEY_ID'] = config.aws_s3.access_key_id;
    process.env['AWS_SECRET_ACCESS_KEY'] = config.aws_s3.secret_key;
  }

  // A instância do `io` precisa ser definida antes de ser usada no middleware.
  // Por isso, declare `io` no escopo mais externo e inicialize-a aqui.
  let ioInstance: Socket; // Declare `ioInstance` aqui

  app.use((req: any, res: any, next: NextFunction) => {
    req.serverOptions = serverOptions;
    req.logger = logger;
    req.io = ioInstance; // Use a instância declarada

    const oldSend = res.send;

    res.send = async function (data: any) {
      const content = req.headers['content-type'];
      if (content == 'application/json') {
        data = JSON.parse(data);
        if (!data.session) data.session = req.client ? req.client.session : '';
        if (data.mapper && req.serverOptions?.mapper?.enable) {
          data.response = await convert(
            req.serverOptions.mapper.prefix,
            data.response,
            data.mapper
          );
          delete data.mapper;
        }
      }
      res.send = oldSend;
      return res.send(data);
    };
    next();
  });

  app.use(routes);

  createFolders();
  const http = createServer(app);

  // Inicialize a instância do Socket.IO aqui
  ioInstance = new Socket(http, {
    cors: {
      // CORREÇÃO: Altere '*' para o domínio específico do seu painel
      origin: 'https://painel.moratosolucoes.com.br',
      credentials: true,
    },
  });

  ioInstance.on('connection', (sock) => {
    // Use ioInstance aqui
    logger.info(`ID: ${sock.id} entrou`);
    sock.on('disconnect', () => {
      logger.info(`ID: ${sock.id} saiu`);
    });
  });

  http.listen(PORT, () => {
    logger.info(`Server is running on port: ${PORT}`);
    logger.info(
      `\x1b[31m Visit ${serverOptions.host}:${PORT}/api-docs for Swagger docs`
    );
    logger.info(`WPPConnect-Server version: ${version}`);

    if (serverOptions.startAllSession) startAllSessions(serverOptions, logger);
  });

  if (config.log.level === 'error' || config.log.level === 'warn') {
    console.log(`\x1b[33m ======================================================
Attention:
Your configuration is configured to show only a few logs, before opening an issue,
please set the log to 'silly', copy the log that shows the error and open your issue.
======================================================
`);
  }
  console.log('--- Fim de initServer ---');
  return {
    app,
    routes,
    logger,
  };
}

// Chame initServer se este for o arquivo principal que o PM2 executa.
if (require.main === module) {
  initServer({});
}
