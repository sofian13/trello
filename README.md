# 🗂️ TeamBoard

Un Trello simple, en PWA, pour toi et tes collègues. Tableaux → colonnes → cartes, glisser-déposer, sync temps réel (Supabase), accès par mot de passe d'équipe.

## Stack
- Next.js 16 (App Router) + Tailwind v4
- Supabase (Postgres + Realtime)
- @hello-pangea/dnd (drag & drop)
- PWA installable (manifest + service worker)

## Mise en route

### 1. Base de données
Dans Supabase → **SQL Editor** → colle le contenu de `supabase-schema.sql` → **Run**.

### 2. Variables d'environnement (`.env.local`)
```
APP_PASSWORD=le-mot-de-passe-de-ton-equipe
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # clé "anon public" (Project Settings > API Keys)
```

### 3. Lancer
```
npm run dev
```
Ouvre http://localhost:3000 → entre le mot de passe.

## Déploiement Vercel
- Pousse le repo sur GitHub, importe-le dans Vercel.
- Ajoute les 3 variables d'env dans Vercel (Project → Settings → Environment Variables).
- Déploie. PWA installable depuis le navigateur (« Ajouter à l'écran d'accueil »).

## Sécurité (à savoir)
L'app est protégée par un mot de passe d'équipe (cookie). La clé **anon** Supabase
est publique côté client et les tables ont une policy RLS permissive — adapté à un
petit groupe de confiance. Pour durcir, on pourra passer par des Server Actions +
clé service role plus tard.
