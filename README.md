This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Linking Gmail accounts

The Hub supports linking multiple Gmail accounts so inbox, calendar, and tasks data merges across them.

1. Sign in with any Google account (Firebase sign-in establishes your user identity).
2. Go to `/settings` → **Linked Google Accounts**.
3. Click **Add another Gmail account**, grant the requested scopes in the Google consent screen.
4. On redirect, the account appears in the list with its linked date.
5. Inbox, calendar, and tasks hydrate from every linked account; each email row shows a small `via <account>` marker.
6. Remove an account from the same settings section; its data clears on next refresh.

Refresh tokens are stored encrypted (AES-256-GCM) server-side and are exchanged for short-lived access tokens on every API call — so the old "hourly 401 re-login" problem is gone.

See `.env.local.example` for the required env vars (Google OAuth client, Firebase Admin SA, token encryption key).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
