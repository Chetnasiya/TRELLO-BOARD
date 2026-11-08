# Tandem

Tandem is a small team board app with an Express API and a browser frontend served from the same origin.

## Run locally

```sh
npm install
```

Set `JWT_SECRET` to a private, stable value before starting the server. Optionally set `MONGODB_URI` to use MongoDB; without it, the app uses an in-memory datastore that is cleared when the server stops.

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000). No frontend build step or separate frontend server is required.

## Use the app

Create an account or sign in, then create an organization. Share its organization ID with teammates so they can open it from their own accounts. Organization admins can invite and remove members and create boards. Organization members can create issues and move them between **To do**, **In progress**, and **Done**.

The app remembers the signed-in account and last-opened organization in the browser. The backend currently has no endpoint for listing all organizations a user belongs to, so an organization ID is needed to open a shared organization on another device or browser.

Run the API and frontend-serving tests with `npm test`.
