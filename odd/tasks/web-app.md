# App web (React + Vite) — tareas

> Objetivo: `apps/web` con react-hook-form, tanstack-query, zustand y react-router-dom v7, contra la api-gateway.
> Alcance autorizado (usuario, 2026-09-27): scaffold completo + páginas auth (login/register/perfil) cableadas al gateway.
> Modo: inline sin subagentes. TDD deshabilitado (sin runner). Verificación: `tsc --noEmit` + `vite build`.
> Decisiones: nombre `web` (renombrable); build con vite (estándar documentado) + `tsup.config.ts` copiado verbatim como pidió el usuario (dormant: ningún script lo invoca — tsup no procesa CSS/assets de una app); `tsconfig.json` idéntico al de `core` (misma profundidad); refresh via cookie `HttpOnly` (proxy `/api`→gateway en dev); access en memoria (zustand) + refresh silencioso al arrancar; envelope `{success,data}` del gateway.

## Checklist

- [x] **W1** Manifiestos y tooling: `package.json` (versiones verificadas en registry), `tsconfig` + `tsup` espejo, `vite.config.ts` (react plugin, puerto 5173, proxy `/api`), `index.html`, `vite-env.d.ts`.
- [x] **W2** Base: `main.tsx`, router (`/login`, `/register`, `/` protegida), `QueryClient` + `apiFetch` (cookies + refresh-on-401), store zustand, layout + CSS mínimo.
- [x] **W3** Páginas auth: login/register (hook-form + mutations) y perfil (`useQuery /me`).
- [x] **W4** Verificación: install + `check-types` + `vite build`. Commit `web-app`.

## Progreso

- 2026-09-27: creado el documento (4 tareas). Versiones fijadas: react 19.3.0, router 7.18.4, query 5.104.0, zustand 5.0.15, RHF 7.89.0, vite 8.3.1, plugin-react 6.1.1.
- 2026-09-27: **W1–W4 cerradas**. Desvíos justificados: `tsconfig` sin `rootDir` + `jsx: react-jsx` (la copia verbatim falla con TS6059/TS17004 — la base es backend); `tsup.config` verbatim dormant (ningún script lo invoca; tsup no procesa CSS de una app). Bugs propios: faltaba `Bearer` en el cliente (logout hubiera fallado), import dinámico inefectivo → estático (ciclo seguro por uso diferido). Smoke: vite 200 + login por proxy 200 con cookie.
