'use strict';
const QRCode = require('qrcode');
const path   = require('path');
const fs     = require('fs');

const QR_DIR = path.resolve('./public/qr');
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });

/**
 * Genera o recupera el QR de check-in para un ventero.
 * El QR codifica la URL de check-in que el vendedor escanea en campo.
 *
 * @param {number} venteroId
 * @param {string} baseUrl     ej: "https://tudominio.com"
 * @returns {Promise<string>}  Ruta relativa del PNG generado
 */
async function generarQR(venteroId, baseUrl = 'http://localhost:3000') {
  const archivo = `ventero-${venteroId}.png`;
  const ruta    = path.join(QR_DIR, archivo);
  const url     = `${baseUrl}/checkin/${venteroId}`;

  await QRCode.toFile(ruta, url, {
    color: { dark: '#C8102E', light: '#FFFFFF' },
    width: 300,
    margin: 2
  });

  return `/qr/${archivo}`;
}

/**
 * Genera el QR como base64 para incrustar en email/SMS sin guardar archivo.
 */
async function generarQRBase64(venteroId, baseUrl = 'http://localhost:3000') {
  const url = `${baseUrl}/checkin/${venteroId}`;
  return QRCode.toDataURL(url, {
    color: { dark: '#C8102E', light: '#FFFFFF' },
    width: 300,
    margin: 2
  });
}

module.exports = { generarQR, generarQRBase64 };
