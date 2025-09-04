# Contributing to Display file DDS edit

We welcome everyone to contribute to the **Display file DDS edit** extension!  
Thanks for helping make this project better 🙏

---

## Getting Started

1. Install [VS Code](https://code.visualstudio.com/download) and [Node.js](https://nodejs.org/en/download/package-manager).
2. Create a [fork](https://github.com/christianlarsen/dspf-edit) of this repository.
3. Clone your fork (replace `your-username` with your GitHub username):
   ```sh
   git clone https://github.com/your-username/dspf-edit.git
   cd dspf-edit
   ```
4. Install all extension dependencies:
   ```sh
   npm install
   ```
5. Open the project in VS Code and use **Run Extension** from the *Run and Debug* view.

---

## Development Workflow

- Always create a new branch for your changes:
  ```sh
  git checkout -b feature/your-feature-name
  ```
- Run the TypeScript compiler:
  ```sh
  npm run compile
  ```
- Start a debug session in VS Code with **Run Extension** to test your changes.
- Run tests:
  ```sh
  npm test
  ```

---

## Quick Checklist Before Submitting a PR

- ✅ Code compiles with `npm run compile`  
- ✅ Tests run successfully with `npm test`  
- ✅ No generated files (`out/`, `node_modules/`) are committed  
- ✅ Clear commit messages  
- ✅ PR description explains what was changed and why  

---

## After Pulling Changes from Main

When you pull the latest changes from `main`, update dependencies and recompile:

```sh
git pull origin main
npm install
npm run compile
```

---

## Questions?

Feel free to open an issue if you’re not sure about something. We’re happy to help!
