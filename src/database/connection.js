const mongoose = require('mongoose');
const config = require('../config');

async function connectDatabase(logger = console) {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => {
    logger.warn('[db] Соединение с MongoDB потеряно, пробую переподключиться...');
  });

  mongoose.connection.on('reconnected', () => {
    logger.log('[db] Соединение с MongoDB восстановлено.');
  });

  await mongoose.connect(config.mongodbUri, {
    serverSelectionTimeoutMS: 10000,
  });

  logger.log('[db] Подключено к MongoDB.');
}

module.exports = { connectDatabase };
