const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // Obligatorio para Azure
        trustServerCertificate: false,
        // Aumentamos los tiempos de espera (en milisegundos)
        connectTimeout: 60000, // 60 segundos para conectar (ideal para despertar la DB)
        requestTimeout: 60000  // 60 segundos para cada consulta
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Conectado a Azure SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('❌ Error detallado en la conexión a la BD:', err);
        // Si falla la primera vez, intentamos reconectar automáticamente después de 5 segundos
        console.log('Reintentando conexión en 5 segundos...');
        setTimeout(() => {
            process.exit(1); // Forzamos reinicio del proceso para que Render intente de nuevo
        }, 5000);
    });

module.exports = { sql, poolPromise };