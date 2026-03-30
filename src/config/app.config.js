require('dotenv').config();

module.exports = {
  PORT:     process.env.PORT     || 11004,
  NODE_ENV: process.env.NODE_ENV || 'development',

  ACCESS_TOKEN_EXPIRY_MINUTES:  parseInt(process.env.ACCESS_TOKEN_EXPIRY_MINUTES)  || 15,
  REFRESH_TOKEN_EXPIRY_DAYS:    parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS)    || 7,
};