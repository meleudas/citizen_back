// middleware/helmet.middleware.js

const helmet = require('helmet');

// Базова конфігурація Helmet
const helmetConfig = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'https:'],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      childSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  
  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false
  },
  
  // Frameguard
  frameguard: {
    action: 'deny'
  },
  
  // Hide Powered-By
  hidePoweredBy: true,
  
  // HSTS
  hsts: {
    maxAge: 31536000, // 1 рік
    includeSubDomains: true,
    preload: true
  },
  
  // IE No Open
  ieNoOpen: true,
  
  // No Sniff
  noSniff: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'no-referrer'
  },
  
  // XSS Filter
  xssFilter: true,
  
  // Expect CT
  expectCt: {
    enforce: true,
    maxAge: 86400
  }
};

// Конфігурація для розробки (менш строга)
const devHelmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'http:', 'https:']
    }
  },
  hsts: false // Вимкнено в розробці через HTTP
};

// Вибір конфігурації в залежності від середовища
const getHelmetConfig = () => {
  return process.env.NODE_ENV === 'production' ? helmetConfig : devHelmetConfig;
};

// Основний Helmet middleware
const helmetMiddleware = helmet(getHelmetConfig());

// Додаткові security middleware
const securityHeaders = (req, res, next) => {
  // Додаткові заголовки безпеки
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

// Middleware для API routes
const apiSecurity = [
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"]
    }
  }),
  helmet.dnsPrefetchControl(),
  helmet.frameguard({ action: 'deny' }),
  helmet.hidePoweredBy(),
  helmet.ieNoOpen(),
  helmet.noSniff(),
  helmet.referrerPolicy({ policy: 'no-referrer' }),
  helmet.xssFilter()
];

// Middleware для публічних маршрутів (менш строгий)
const publicSecurity = [
  helmet.hidePoweredBy(),
  helmet.frameguard({ action: 'deny' }),
  helmet.noSniff(),
  helmet.xssFilter()
];

module.exports = {
  helmet: helmetMiddleware,
  securityHeaders,
  apiSecurity,
  publicSecurity,
  helmetConfig,
  devHelmetConfig
};