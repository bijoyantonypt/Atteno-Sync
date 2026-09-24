# Atteno_Sync Installation and Deployment Guide

This guide explains how to install, configure, run, and deploy the Atteno_Sync project.

## 1. Prerequisites

Before starting, make sure you have:

- Node.js 20 or newer
- npm
- A Supabase account
- A GitHub account
- A Vercel account (recommended for the admin dashboard)
- Android Studio with JDK 17 and Android SDK
- Deno (required for running payroll tests locally)
- A USB fingerprint scanner compatible with Android USB OTG

## 2. Project Structure Overview

The repo contains:

- `web/` - Admin dashboard built with Vite + React
- `kiosk/` - Android kiosk app source files
- `supabase/` - Database migrations and edge functions
- `README.md` - project overview and architecture

## 3. Install Dependencies for the Web App

From the repo root:

```powershell
cd web
npm install
```

If you are working from the root directory instead, make sure the project folder path is correct.

## 4. Configure Supabase for the Web App

Create a local environment file:

```powershell
cd web
Copy-Item .env.example .env.local
```

Then fill in your Supabase project values in `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

These values are available in Supabase Dashboard → Project Settings → API.

## 5. Start the Web App Locally

Run:

```powershell
cd web
npm run dev
```

The dashboard should open on a local Vite URL such as:

```text
http://localhost:5173
```

## 6. Deploy the Web App to Vercel

1. Open Vercel
2. Select New Project
3. Import this repository
4. Set the Root Directory to `web`
5. Add these environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy the app

After deployment, add the Vercel URL to:

- Supabase Authentication → URL Configuration
- Supabase secret `ALLOWED_ORIGIN`

## 7. Set Up Supabase Backend

Create a project in Supabase, then from the repo root run:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase functions deploy
npx supabase secrets set ALLOWED_ORIGIN=https://<your-admin-site>.vercel.app
```

If the CLI is not available, install Node.js first and ensure `npx` is working in your terminal.

## 8. Configure Authentication and Admin Access

In Supabase Dashboard:

1. Go to Authentication → Sign In / Providers
2. Turn off "Allow new users to sign up"
3. Go to Authentication → Users
4. Add the manager/admin account

Then run this SQL in the SQL Editor:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'manager@yourcompany.com';

update public.settings
set timezone = 'Asia/Kolkata',
    late_grace_minutes = 5,
    overtime_multiplier = 1.5,
    currency = 'INR';
```

## 9. Run Payroll Tests

Install Deno and run:

```powershell
deno test supabase/functions/_shared/payroll.test.ts
```

## 10. Set Up the Android Kiosk App

The kiosk app is a React Native app intended for Android devices with USB OTG support.

Generate a React Native project:

```powershell
npx @react-native-community/cli@latest init Atteno_SyncKiosk
cd Atteno_SyncKiosk
npm install @react-native-async-storage/async-storage @react-native-community/netinfo
```

Copy the relevant files from this repo:

- `kiosk/App.tsx`
- `kiosk/src/`
- `kiosk/android/app/src/main/java/com/atteno_sync/...`
- `kiosk/android/app/src/main/res/xml/...`

Then update the kiosk config file `kiosk/src/config.ts`:

```ts
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY';
```

## 11. Scanner Setup

For Android fingerprint scanning, install the scanner SDK for your device.

Example with SecuGen:

- Register on the SecuGen developer site
- Download FDx SDK Pro for Android
- Copy the `.jar` file into `android/app/libs/`
- Copy SDK `.so` libraries into `android/app/src/main/jniLibs/`
- Add the dependency to `android/app/build.gradle`

Example:

```gradle
dependencies {
    implementation files('libs/FDxSDKProFDAndroid.jar')
}
```

## 12. Final Check

Once configured, the working setup is:

- Web dashboard running locally or deployed on Vercel
- Supabase database and edge functions deployed
- Admin account created and assigned access
- Kiosk app connected to Supabase using the correct keys
- Android device with fingerprint scanner configured and ready for attendance capture

## 13. Common Troubleshooting

### `npx` is not recognized

Install Node.js and restart the terminal. Then verify:

```powershell
node -v
npm -v
```

### Supabase CLI commands fail

Make sure you are running commands from a directory where Node/npm is installed and available in PATH.

### Local web app does not load

Check whether `.env.local` exists and contains valid values.

## 14. Recommended Deployment Flow

Use this recommended sequence:

1. Install Node.js and dependencies
2. Configure `.env.local`
3. Deploy Supabase backend
4. Link the project with `supabase link`
5. Run `db push`
6. Deploy edge functions
7. Deploy web dashboard to Vercel
8. Set admin user access
9. Test attendance and payroll workflows

This completes the installation and deployment process for Atteno_Sync.


