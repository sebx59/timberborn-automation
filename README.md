# Real-Time Variable Dashboard

A unified full-stack application that provides a real-time dashboard for mapping ON/OFF states via Socket.io. The application features a Node.js/Express backend that directly serves a compiled Angular frontend on a single port for seamless full-stack real-time communication.

## 🚀 Key Features

*   **Real-time Updates:** Instant state changes propagated to all connected clients via Socket.io.
*   **Unified Architecture:** Both the backend API and Angular frontend are served from a single Express server port (`8081`).
*   **RESTful APIs:** Simple endpoints to interface with external systems by firing ON/OFF commands (`/on/:name`, `/off/:name`).
*   **Dynamic Dashboard:** Sleek 2-column UI providing immediate feedback as external state events hit the backend.

---

## 📋 Prerequisites

Before you retrieve and launch the project, ensure you have the following dependencies installed on your local machine:

1.  **[Node.js](https://nodejs.org/)** (v18.0.0 or higher recommended)
    *   **Why you need it:** Node.js is the JavaScript runtime required to both run the backend server and build the Angular frontend (it includes `npm` by default).
    *   **Download & Install:** [https://nodejs.org/](https://nodejs.org/)

2.  **[Git](https://git-scm.com/)** (v2.0.0 or higher)
    *   **Why you need it:** Git allows you to clone the repository to your local machine.
    *   **Download & Install:** [https://git-scm.com/downloads](https://git-scm.com/downloads)

---

## 🛠️ Installation & Setup

Follow these detailed steps to retrieve and launch the project locally.

### 1. Retrieve the Repository

Open your terminal or command prompt and run the following command to clone the project:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
cd YOUR_REPOSITORY_NAME
```
*(Remember to replace the URL with the actual GitHub link of your repository once you publish it!)*

### 2. Install Dependencies

Install all the required Node.js packages for both the backend server and frontend framework:

```bash
npm install
```

### 3. Build the Application

The backend Express server is configured to serve the statically compiled Angular application. You need to build the frontend first so that the backend has static files to serve:

```bash
npm run build
```
*(This command runs the Angular CLI to bundle the dashboard interface into the `dist/frontend/browser` directory).*

### 4. Launch the Server

Start the unified server, which launches the backend API, activates Socket.io, and serves the frontend dashboard:

```bash
npm run serve:prod
```
Alternatively, you can start the server directly using Node:
```bash
node server.js
```

### 5. Access the Dashboard

Open your web browser and navigate to:
[http://localhost:8081](http://localhost:8081)

---

## 📡 Simulating Data via API

Once the server is running, you can test the real-time reactivity of the dashboard by calling the provided backend API endpoints from your browser or a tool like cURL/Postman:

*   **Turn a variable ON:**
    `GET http://localhost:8081/on/myCustomVariable`
*   **Turn a variable OFF:**
    `GET http://localhost:8081/off/myCustomVariable`

The moment you hit these endpoints, the variable cards will automatically appear and update on your dashboard in real-time!

## 💻 Tech Stack

*   **Frontend:** Angular (v17+), HTML5, Vanilla CSS3
*   **Backend:** Node.js, Express (v5+)
*   **Real-time Communication:** Socket.io
