const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Format personnalisé pour la console
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(metadata).length > 0 && metadata.stack) {
            msg += `\n${metadata.stack}`;
        }
        return msg;
    })
);

// Format pour les fichiers (JSON pour faciliter l'analyse ultérieure si besoin)
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: 'info',
    transports: [
        // Console pour le feedback en direct
        new winston.transports.Console({
            format: consoleFormat
        }),
        // Logs de connexion avec rotation quotidienne
        new DailyRotateFile({
            filename: path.join(__dirname, 'logs', 'connection-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d',
            level: 'info',
            format: fileFormat
        }),
        // Erreurs critiques séparées
        new DailyRotateFile({
            filename: path.join(__dirname, 'logs', 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '30d',
            level: 'error',
            format: fileFormat
        }),
        // Logs combinés
        new DailyRotateFile({
            filename: path.join(__dirname, 'logs', 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d',
            format: fileFormat
        })
    ],
    // Empêche le crash du processus sur une erreur de logging
    exitOnError: false
});

module.exports = logger;
