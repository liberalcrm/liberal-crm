'use strict';

let twilioClient = null;

function getTwilio() {
  if (twilioClient) return twilioClient;
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('ACxx')) {
    console.warn('⚠ Twilio no configurado — mensajes en modo simulación');
    return null;
  }
  twilioClient = require('twilio')(sid, token);
  return twilioClient;
}

/**
 * Enviar SMS a un número colombiano.
 * @param {string} to   Número destino ej: "3001234567"
 * @param {string} body Texto del mensaje
 */
async function enviarSMS(to, body) {
  const numero = normalizarNumero(to);
  const client = getTwilio();
  if (!client) {
    console.log(`[SIM-SMS] → ${numero}: ${body}`);
    return { sid: 'sim_' + Date.now(), status: 'simulated' };
  }
  return client.messages.create({ from: process.env.TWILIO_PHONE_FROM, to: numero, body });
}

/**
 * Enviar mensaje por WhatsApp.
 * @param {string} to   Número destino ej: "3001234567"
 * @param {string} body Texto del mensaje
 */
async function enviarWhatsApp(to, body) {
  const numero = normalizarNumero(to);
  const client = getTwilio();
  if (!client) {
    console.log(`[SIM-WA] → ${numero}: ${body}`);
    return { sid: 'sim_' + Date.now(), status: 'simulated' };
  }
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to:   'whatsapp:' + numero,
    body
  });
}

/**
 * Envío masivo a lista de venteros.
 * @param {Array<{tel:string, nombre:string}>} lista
 * @param {string} plantilla   Mensaje con {{nombre}} como variable
 * @param {string} canal       'sms' | 'whatsapp'
 */
async function envioMasivo(lista, plantilla, canal = 'whatsapp') {
  const resultados = [];
  for (const v of lista) {
    const mensaje = plantilla.replace('{{nombre}}', v.nombre.split(' ')[0]);
    try {
      const r = canal === 'sms'
        ? await enviarSMS(v.tel, mensaje)
        : await enviarWhatsApp(v.whatsapp || v.tel, mensaje);
      resultados.push({ ventero: v.nombre, status: r.status || 'ok', sid: r.sid });
    } catch (e) {
      resultados.push({ ventero: v.nombre, status: 'error', error: e.message });
    }
    // Pausa para evitar rate-limit de Twilio
    await new Promise(r => setTimeout(r, 200));
  }
  return resultados;
}

function normalizarNumero(tel) {
  const digits = tel.replace(/\D/g, '');
  if (digits.startsWith('57')) return '+' + digits;
  if (digits.length === 10)   return '+57' + digits;
  return '+' + digits;
}

module.exports = { enviarSMS, enviarWhatsApp, envioMasivo };
