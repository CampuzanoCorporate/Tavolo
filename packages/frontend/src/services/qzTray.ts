const QZ_SCRIPT_SOURCES = [
  '/qz/qz-tray.js',
  'https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.js',
  'https://unpkg.com/qz-tray@2.2.6/qz-tray.js',
];

import { apiClient } from './api';

type QzTrayApi = {
  websocket: {
    connect: (options?: unknown) => Promise<void>;
    disconnect?: () => Promise<void>;
    isActive?: () => boolean;
  };
  api?: {
    setPromiseType?: (promiseFactory: (resolver: (resolve: (value?: unknown) => void, reject: (reason?: unknown) => void) => void) => Promise<unknown>) => void;
  };
  security?: {
    setCertificatePromise?: (handler: (resolve: (value: string) => void, reject: (reason?: unknown) => void) => void) => void;
    setSignaturePromise?: (handler: (toSign: string) => (resolve: (value: string) => void, reject: (reason?: unknown) => void) => void) => void;
    setSignatureAlgorithm?: (algorithm: string) => void;
  };
  printers: {
    find: (query?: string) => Promise<string[] | string>;
  };
  configs: {
    create: (printerName: string, options?: unknown) => unknown;
  };
  print: (config: unknown, data: unknown[]) => Promise<void>;
};

declare global {
  interface Window {
    qz?: QzTrayApi;
  }
}

let qzLoaderPromise: Promise<QzTrayApi> | null = null;
let qzSecurityPromise: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-qz-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.qzSrc = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });
}

async function loadQzGlobal() {
  for (const src of QZ_SCRIPT_SOURCES) {
    try {
      await loadScript(src);
      if (window.qz) {
        window.qz.api?.setPromiseType?.((resolver) => new Promise(resolver));
        return window.qz;
      }
    } catch {
      // Intentamos la siguiente fuente
    }
  }

  throw new Error('No se pudo cargar QZ Tray. Instala QZ Tray y copia qz-tray.js en /qz/ o permite la carga del CDN.');
}

async function configureQzSecurity(qz: QzTrayApi) {
  if (!qz.security?.setCertificatePromise || !qz.security?.setSignaturePromise) {
    return;
  }

  qz.security.setCertificatePromise((resolve, reject) => {
    apiClient.get<string>('/api/qz/certificate', {
      responseType: 'text',
      transformResponse: [(value) => value],
    })
      .then((response) => resolve(response.data))
      .catch((error) => reject(error));
  });

  qz.security.setSignatureAlgorithm?.('SHA512');
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    apiClient.post<{ data: string }>('/api/qz/sign', { request: toSign })
      .then((response) => resolve(response.data.data))
      .catch((error) => reject(error));
  });
}

export async function getQzTray() {
  qzLoaderPromise ??= loadQzGlobal();
  const qz = await qzLoaderPromise;

  qzSecurityPromise ??= configureQzSecurity(qz);
  await qzSecurityPromise;

  return qz;
}

export async function ensureQzTrayConnection() {
  const qz = await getQzTray();

  if (qz.websocket.isActive?.()) {
    return qz;
  }

  await qz.websocket.connect();
  return qz;
}

export async function listQzTrayPrinters() {
  const qz = await ensureQzTrayConnection();
  const printers = await qz.printers.find();

  if (Array.isArray(printers)) {
    return printers;
  }

  return printers ? [printers] : [];
}

export async function printRawBase64WithQzTray(printerName: string, rawBase64: string) {
  const qz = await ensureQzTrayConnection();
  const config = qz.configs.create(printerName);

  await qz.print(config, [
    {
      type: 'raw',
      format: 'command',
      flavor: 'base64',
      data: rawBase64,
    },
  ]);
}
