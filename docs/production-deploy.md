# Despliegue de Produccion

Esta guia deja Tavolo publicado bajo un unico dominio:

- `https://tavolo.campuzanodrive.es` para la app web
- `https://tavolo.campuzanodrive.es/api/*` para la API

## 1. Preparar `.env`

Ejemplo recomendado:

```env
DB_USER=tavolo
DB_PASSWORD=CAMBIA_ESTA_PASSWORD
DB_NAME=tavolo_pos
DB_HOST=postgres
DB_PORT=5432
DATABASE_URL=postgresql://tavolo:CAMBIA_ESTA_PASSWORD@postgres:5432/tavolo_pos?schema=public

PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://tavolo.campuzanodrive.es

JWT_SECRET=CAMBIA_ESTE_SECRETO_LARGO
JWT_EXPIRES_IN=8h
CERT_ENCRYPTION_SECRET=CAMBIA_ESTE_SECRETO_DISTINTO

AEAT_DELIVERY_MODE=real
AEAT_ENDPOINT_URL=https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP
AEAT_TIMEOUT_MS=15000
AEAT_SOFTWARE_DEVELOPER_NAME=Tavolo POS
AEAT_SOFTWARE_DEVELOPER_NIF=TU_NIF_DESARROLLADOR_O_REPRESENTANTE
AEAT_SOFTWARE_NAME=TAVOLOPOS
AEAT_SOFTWARE_ID=01
AEAT_SOFTWARE_VERSION=1.0.0
AEAT_SOFTWARE_INSTALLATION_ID=tavolo-bar-01
AEAT_SOFTWARE_ONLY_VERIFACTU=S
AEAT_SOFTWARE_MULTI_OT=N
AEAT_SOFTWARE_MULTIPLE_OT_INDICATOR=N
BUSINESS_NAME=Tavolo
BUSINESS_NIF=B12345678
BUSINESS_ADDRESS=Calle del Bar 1, Madrid
INVOICE_SERIES=T

LICENSE_MASTER_KEY=CAMBIA_ESTA_CLAVE
LICENSE_VALIDITY_DAYS=30
LICENSE_GRACE_DAYS=7

VITE_API_URL=https://tavolo.campuzanodrive.es
```

## 2. Levantar produccion

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

## 3. Comprobar servicios

```bash
docker compose -f docker-compose.prod.yml ps
curl http://127.0.0.1/health
```

## 4. Cloudflare

Crea un registro:

- Tipo: `A`
- Nombre: `tavolo`
- Contenido: IP publica de tu servidor o router

Si usas proxy de Cloudflare, configura SSL/TLS en `Full` o `Full (strict)` cuando pongas certificado en el servidor frontal.

## 5. Router

Redirige:

- puerto `80` TCP al servidor Tavolo
- puerto `443` TCP si luego añades HTTPS local

## 6. Actualizar la app

```bash
git pull
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

## 7. Ver logs

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f postgres
```

## 8. Notas

- En este compose, el frontend sirve la SPA y reenvia `/api` al backend con Nginx.
- La base de datos no se expone a internet.
- Para impresoras del sistema, la impresora debe estar instalada dentro de la maquina o contenedor que ejecuta el backend.
- Para remisión real VERI*FACTU, debes cargar el certificado desde administración y activar `AEAT_DELIVERY_MODE=real`.
- El endpoint SOAP oficial de pruebas para VERI*FACTU es `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`.
