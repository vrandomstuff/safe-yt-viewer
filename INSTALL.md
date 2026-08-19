# Dependencies
You need to install the following and have them in the path.
```
nodejs
deno (yt-dlp uses deno to solve youtube challenges; without it youtube may throw 401 errors)
pnpm (not fully needed but it does speed up the setup process and the rest assumes you are using pnpm just use the equivalent commands for your choice of package manager)
python3 (yt-dlp is written in python)
pip (for yt-dlp)
yt-dlp (this is how we get the videos)
```

# .env Setup
Add DATABASE_URL which is the postgresql connection string format is postgresql://<Username>:<Password>@<Server address>:<Port default is 5432>/<Database name>
Add SHARED_ADMIN_SECRET it is used to authenticate the api endpoints. KEEP IT SAFE IF IT GETS INTO THE WRONG HANDS THE VIDEOS WILL DISAPPEAR! I would recommend using the password generator function in your password manager of choice for this.

# Database setup
First install the modules using:
```
pnpm i
```
Push the schema to the database using:
```
npx drizzle-kit push
```
Commands like pnpx/pnpm dlx will not work to push the changes npx is required.
DATABASE_URL in .env is required for this to function.

# Building
To build run:
```
pnpm run build
```
# Running
This is what you run to start the server:
```
pnpm run start
```
