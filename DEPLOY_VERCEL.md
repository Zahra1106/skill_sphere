# GitHub par push + Vercel par deploy (step by step)

> Pehle `backend` folder ko apne PC par extract karein. Neeche ki saari commands us folder ke andar chalani hain.

## A) Local par ek baar chala kar dekh lein
```bash
npm install
npm test            # 11 pass
```

## B) GitHub par push (node_modules nahi jayega)
`.gitignore` is folder mein pehle se hai (usme `node_modules/`, `.env`, `.vercel`, database files ignore hain).

1. github.com par **New repository** banayein, naam `skill-sphere-backend`. **README / .gitignore add NA karein** (khali repo).
2. Backend folder mein terminal kholein:
```bash
git init
git branch -M main
git add .
git status
```
3. `git status` mein **node_modules ya .env nazar nahi aana chahiye.** Check ke liye:
   - Windows (CMD/PowerShell): `git ls-files | findstr node_modules` -> kuch print nahi hona chahiye
   - Mac/Linux: `git ls-files | grep node_modules`
4. Commit aur push (USERNAME apna GitHub username):
```bash
git commit -m "Skill Sphere backend"
git remote add origin https://github.com/USERNAME/skill-sphere-backend.git
git push -u origin main
```
(Pehli baar git ho to pehle: `git config --global user.name "Your Name"` aur `git config --global user.email "you@example.com"`.)

**Agar galti se node_modules pehle add ho chuka ho:**
```bash
git rm -r --cached node_modules
git commit -m "Stop tracking node_modules"
git push
```
Agar `.env` add ho gaya ho: `git rm --cached .env` (aur us mein jo secrets the unhe badal dein).

## C) Database: Turso (free)
Vercel par SQLite file nahi chalti, isliye hosted SQLite (Turso) use hota hai.
1. app.turso.tech par GitHub se sign up karein -> **Create Database** (naam `skillsphere`, region apne qareeb).
2. Database kholein -> **URL** copy karein (`libsql://skillsphere-xxxx.turso.io`).
3. **Generate Token** (read & write) -> token copy karein.
Tables backend khud pehli request par bana deta hai.

## D) Vercel par deploy
1. vercel.com -> **Add New -> Project** -> GitHub se `skill-sphere-backend` import karein.
2. **Framework Preset: Other.** Build command / Output directory khali chhor dein.
3. **Environment Variables** add karein:

| Name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | aapke Firebase project ka ID (`skillsphere-7aada`) |
| `DATABASE_URL` | Turso ka `libsql://...` URL |
| `DATABASE_AUTH_TOKEN` | Turso ka token |
| `NODE_ENV` | `production` |

4. **Deploy** dabayein.
5. Browser mein kholein: `https://<project>.vercel.app/health` -> `{"status":"ok"}`.

Agar login/401 wala Vercel ka page aaye: Project -> Settings -> **Deployment Protection** mein protection band karein
(ya sirf asli production URL `https://<project>.vercel.app` use karein).

Agar `/health` par `startup_failed` aaye: `DATABASE_URL` ya `DATABASE_AUTH_TOKEN` galat hai. Vercel -> Project -> **Logs** mein wajah likhi hoti hai.

Env var badalne ke baad **Redeploy** zaroori hai.

## E) Flutter app ko is server se jodein
```bash
flutter run --dart-define=API_BASE_URL=https://<project>.vercel.app
```
Release APK/AAB ke liye bhi wahi `--dart-define` lagayein. https hai, isliye cleartext wali settings ki zaroorat nahi.

## F) Baad mein code badalna
```bash
git add .
git commit -m "describe change"
git push
```
Vercel khud naya deploy kar deta hai.

## Yaad rakhein
- Pehle Firebase RTDB ka data yahan nahi aata, database khali shuru hota hai.
- Rate limit serverless mein har warm instance ka alag hota hai (pura protection nahi, bas basic).
- Free plan par pehli request thori slow ho sakti hai (cold start).
