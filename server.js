const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();
const { poolPromise, sql } = require('./src/config/db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'el_tayta_secret_key_98765',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

// --- RUTAS DE NAVEGACIÓN ---
app.get('/dashboard', (req, res) => {
    if (req.session.user) res.sendFile(path.join(__dirname, 'public/dashboard.html'));
    else res.redirect('/');
});

app.get('/maestros', (req, res) => {
    if (req.session.user) res.sendFile(path.join(__dirname, 'public/maestros.html'));
    else res.redirect('/');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// --- API LOGIN Y USUARIO ---
app.post('/api/login', async (req, res) => {
    const { usuario, clave } = req.body;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('user', sql.NVarChar, usuario)
            .input('pass', sql.NVarChar, clave)
            .query('SELECT Id, Usuario, NombreCompleto, Rol FROM Usuarios WHERE Usuario = @user AND Clave = @pass');
        if (result.recordset.length > 0) {
            req.session.user = result.recordset[0];
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
    } catch (err) { res.status(500).json({ success: false, message: 'Error en el servidor' }); }
});

app.get('/api/user-info', (req, res) => {
    if (req.session.user) res.json(req.session.user);
    else res.status(401).json({ error: 'No autorizado' });
});

// --- API DE CLIENTES ---
app.get('/api/clientes', async (req, res) => {
    const search = req.query.search || '';
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('search', sql.NVarChar, `%${search}%`)
            .query(`SELECT TOP 50 Codclie, Documento, Razon, Direccion, Celular, Email FROM Clientes WHERE (Documento LIKE @search OR Razon LIKE @search) AND Activo = 1 ORDER BY Codclie DESC`);
        res.json(result.recordset);
    } catch (err) {
        console.error("ERROR SQL CLIENTES:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/clientes/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.id).query('SELECT * FROM Clientes WHERE Codclie = @id');
        res.json(result.recordset[0] || {});
    } catch (err) { res.status(500).json({}); }
});

app.post('/api/clientes', async (req, res) => {
    const { tipoDoc, documento, razon, direccion, celular, email } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('td', sql.Char(1), tipoDoc).input('doc', sql.VarChar(12), documento)
            .input('raz', sql.VarChar(200), razon).input('dir', sql.VarChar(200), direccion)
            .input('cel', sql.VarChar(10), celular).input('em', sql.VarChar(100), email)
            .query(`INSERT INTO Clientes (tipoDoc, Documento, Razon, Direccion, Celular, Email, Activo, Fecha) VALUES (@td, @doc, @raz, @dir, @cel, @em, 1, GETDATE())`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.put('/api/clientes/:id', async (req, res) => {
    const { tipoDoc, documento, razon, direccion, celular, email } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, req.params.id).input('td', sql.Char(1), tipoDoc)
            .input('doc', sql.VarChar(12), documento).input('raz', sql.VarChar(200), razon)
            .input('dir', sql.VarChar(200), direccion).input('cel', sql.VarChar(10), celular)
            .input('em', sql.VarChar(100), email)
            .query(`UPDATE Clientes SET tipoDoc=@td, Documento=@doc, Razon=@raz, Direccion=@dir, Celular=@cel, Email=@em WHERE Codclie=@id`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.patch('/api/clientes/delete/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, req.params.id).query('UPDATE Clientes SET Activo = 0 WHERE Codclie = @id');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- API DE PROVEEDORES ---
app.get('/api/proveedores', async (req, res) => {
    const search = req.query.search || '';
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('search', sql.NVarChar, `%${search}%`)
            .query(`SELECT TOP 50 CodProv, Documento, Razon, Direc1, Telefono1, Email FROM Proveedores WHERE (Documento LIKE @search OR Razon LIKE @search) AND Eliminado = 0 ORDER BY CodProv DESC`);
        res.json(result.recordset);
    } catch (err) { res.json([]); }
});

app.get('/api/proveedores/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Char(4), req.params.id).query('SELECT * FROM Proveedores WHERE CodProv = @id');
        res.json(result.recordset[0] || {});
    } catch (err) { res.status(500).json({}); }
});

app.post('/api/proveedores', async (req, res) => {
    const { tipoDoc, documento, razon, direccion, telefono, email } = req.body;
    try {
        const pool = await poolPromise;
        const lastProv = await pool.request().query("SELECT MAX(CodProv) as last FROM Proveedores");
        let nextId = (parseInt(lastProv.recordset[0].last || 0) + 1).toString().padStart(4, '0');
        await pool.request()
            .input('cod', sql.Char(4), nextId).input('td', sql.Char(1), tipoDoc)
            .input('doc', sql.Char(12), documento).input('raz', sql.VarChar(60), razon)
            .input('dir', sql.VarChar(60), direccion).input('tel', sql.VarChar(10), telefono)
            .input('em', sql.VarChar(30), email)
            .query(`INSERT INTO Proveedores (CodProv, tipoDoc, Documento, Razon, Direc1, Telefono1, Email, Eliminado) VALUES (@cod, @td, @doc, @raz, @dir, @tel, @em, 0)`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.put('/api/proveedores/:id', async (req, res) => {
    const { tipoDoc, documento, razon, direccion, telefono, email } = req.body;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Char(4), req.params.id).input('td', sql.Char(1), tipoDoc)
            .input('doc', sql.Char(12), documento).input('raz', sql.VarChar(60), razon)
            .input('dir', sql.VarChar(60), direccion).input('tel', sql.VarChar(10), telefono)
            .input('em', sql.VarChar(30), email)
            .query(`UPDATE Proveedores SET tipoDoc=@td, Documento=@doc, Razon=@raz, Direc1=@dir, Telefono1=@tel, Email=@em WHERE CodProv=@id`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.patch('/api/proveedores/delete/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Char(4), req.params.id).query('UPDATE Proveedores SET Eliminado = 1 WHERE CodProv = @id');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- API DE EMPLEADOS ---
app.get('/api/tipo-empleado', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT * FROM TipoEmpleado ORDER BY descripcion");
        res.json(result.recordset);
    } catch (err) { res.json([]); }
});

app.get('/api/empleados', async (req, res) => {
    const search = req.query.search || '';
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('search', sql.NVarChar, `%${search}%`)
            .query(`SELECT E.Codemp, E.Documento, E.Nombre, E.Celular, E.Direccion, E.Email, T.descripcion as TipoNombre, E.Tipo 
                    FROM Empleados E 
                    LEFT JOIN TipoEmpleado T ON E.Tipo = T.idTipo 
                    WHERE (E.Documento LIKE @search OR E.Nombre LIKE @search) AND E.Activo = 1`);
        res.json(result.recordset);
    } catch (err) {
        console.error("ERROR SQL EMPLEADOS:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/empleados/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT Codemp, Documento, Nombre, Celular, Tipo, Direccion, Email FROM Empleados WHERE Codemp = @id');

        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ error: "No encontrado" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/empleados', async (req, res) => {
    const { documento, razon, celular, tipo, direccion, email } = req.body;
    try {
        const pool = await poolPromise;
        const last = await pool.request().query("SELECT ISNULL(MAX(Codemp),0) + 1 as next FROM Empleados");
        let nextId = last.recordset[0].next;

        // Validar tipo (debe ser número o null)
        const idTipo = tipo && tipo !== "" ? parseInt(tipo) : null;

        await pool.request()
            .input('id', sql.Int, nextId)
            .input('doc', sql.Char(12), documento || '')
            .input('nom', sql.VarChar(50), razon || '')
            .input('cel', sql.VarChar(10), celular || '')
            .input('tip', sql.Int, idTipo)
            .input('dir', sql.VarChar(60), direccion || '')
            .input('em', sql.VarChar(100), email || '')
            .query(`INSERT INTO Empleados (Codemp, Documento, Nombre, Celular, Tipo, Direccion, Email, Activo) 
                    VALUES (@id, @doc, @nom, @cel, @tip, @dir, @em, 1)`);
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR AL GUARDAR EMPLEADO:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/empleados/:id', async (req, res) => {
    const { documento, razon, celular, tipo, direccion, email } = req.body;
    try {
        const pool = await poolPromise;
        const idTipo = tipo && tipo !== "" ? parseInt(tipo) : null;

        await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .input('doc', sql.Char(12), documento || '')
            .input('nom', sql.VarChar(50), razon || '')
            .input('cel', sql.VarChar(10), celular || '')
            .input('tip', sql.Int, idTipo)
            .input('dir', sql.VarChar(60), direccion || '')
            .input('em', sql.VarChar(100), email || '')
            .query(`UPDATE Empleados 
                    SET Documento=@doc, Nombre=@nom, Celular=@cel, Tipo=@tip, Direccion=@dir, Email=@em 
                    WHERE Codemp=@id`);
        res.json({ success: true });
    } catch (err) {
        console.error("Error al actualizar empleado:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.patch('/api/empleados/delete/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, req.params.id).query('UPDATE Empleados SET Activo = 0 WHERE Codemp = @id');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- API DE LÍNEAS Y CLASES (VERSIÓN CORREGIDA) ---

// 1. Listar
app.get('/api/:tabla', async (req, res, next) => {
    const { tabla } = req.params;
    if (tabla !== 'lineas' && tabla !== 'clases') return next();

    const search = req.query.search || '';
    try {
        const pool = await poolPromise;
        let query = "";
        if (tabla === 'lineas') {
            query = `SELECT CodLinea as ID, Nombre FROM Lineas WHERE Nombre LIKE @search AND Activo = 1 ORDER BY Nombre ASC`;
        } else {
            query = `SELECT C.CodClase as ID, C.Nombre, L.Nombre as LineaPadre 
                     FROM Clases C 
                     LEFT JOIN Lineas L ON C.CodLinea = L.CodLinea 
                     WHERE C.Nombre LIKE @search AND C.Activo = 1 ORDER BY C.Nombre ASC`;
        }
        const result = await pool.request().input('search', sql.NVarChar, `%${search}%`).query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Obtener uno
app.get('/api/:tabla/:id', async (req, res, next) => {
    const { tabla, id } = req.params;
    if (tabla !== 'lineas' && tabla !== 'clases') return next();
    const idName = tabla === 'lineas' ? 'CodLinea' : 'CodClase';
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${tabla} WHERE ${idName} = @id`);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. Guardar Nuevo
app.post('/api/:tabla', async (req, res, next) => {
    const { tabla } = req.params;
    if (tabla !== 'lineas' && tabla !== 'clases') return next();
    const { razon, codLineaPadre } = req.body;
    try {
        const pool = await poolPromise;
        if (tabla === 'lineas') {
            await pool.request().input('nom', sql.VarChar(50), razon).query(`INSERT INTO Lineas (Nombre, Activo) VALUES (@nom, 1)`);
        } else {
            // Para Clases, nos aseguramos que codLineaPadre sea un número
            await pool.request()
                .input('nom', sql.VarChar(50), razon)
                .input('lin', sql.Int, parseInt(codLineaPadre))
                .query(`INSERT INTO Clases (Nombre, CodLinea, Activo) VALUES (@nom, @lin, 1)`);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Actualizar
app.put('/api/:tabla/:id', async (req, res, next) => {
    const { tabla, id } = req.params;
    if (tabla !== 'lineas' && tabla !== 'clases') return next();
    const { razon, codLineaPadre } = req.body;
    const idName = tabla === 'lineas' ? 'CodLinea' : 'CodClase';
    try {
        const pool = await poolPromise;
        if (tabla === 'lineas') {
            await pool.request().input('id', sql.Int, id).input('nom', sql.VarChar(50), razon).query(`UPDATE Lineas SET Nombre = @nom WHERE CodLinea = @id`);
        } else {
            await pool.request().input('id', sql.Int, id).input('nom', sql.VarChar(50), razon).input('lin', sql.Int, codLineaPadre).query(`UPDATE Clases SET Nombre = @nom, CodLinea = @lin WHERE CodClase = @id`);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 5. Borrado Lógico (NUEVA RUTA FALTANTE)
app.patch('/api/:tabla/delete/:id', async (req, res, next) => {
    const { tabla, id } = req.params;
    if (tabla !== 'lineas' && tabla !== 'clases') return next();
    const idName = tabla === 'lineas' ? 'CodLinea' : 'CodClase';
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, id).query(`UPDATE ${tabla} SET Activo = 0 WHERE ${idName} = @id`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- API PRODUCTOS (PLACEHOLDER PARA EVITAR ERRORES) ---
app.get('/api/productos', async (req, res) => { res.json([]); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});