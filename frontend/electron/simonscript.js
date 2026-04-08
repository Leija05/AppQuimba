const crypto = require('crypto');
const fs = require('fs');

const SECRET_KEY = 'Leija091105'; 
const ALGORITHM = 'aes-256-cbc';

function generarArchivoLicencia(clienteHWID) {
    const textoValidacion = 'LICENCIA_ACTIVA_QUIMBAR';
    const iv = crypto.randomBytes(16);
    
    const key = crypto.scryptSync(SECRET_KEY, clienteHWID, 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(textoValidacion, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const contenidoFinal = `${iv.toString('hex')}:${encrypted}`;

    const nombreArchivo = `license_${clienteHWID.substring(0, 5)}.dat`;
    fs.writeFileSync(nombreArchivo, contenidoFinal);

    console.log('-------------------------------------------');
    console.log('✅ LICENCIA GENERADA CON ÉXITO');
    console.log(`Archivo creado: ${nombreArchivo}`);
    console.log(`ID Procesado: ${clienteHWID}`);
    console.log('-------------------------------------------');
}

// --- EJECUCIÓN DIRECTA ---
const idDelCliente = '03d32c7b63098112f2b4935d7a70223604bf538772b0a100d628159b643b106d'; 

generarArchivoLicencia(idDelCliente);   