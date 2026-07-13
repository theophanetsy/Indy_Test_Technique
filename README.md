# Getting Started with [Fastify-CLI](https://www.npmjs.com/package/fastify-cli)
This project was bootstrapped with Fastify-CLI.

## Available Scripts

In the project directory, you can run:

### `npm run dev`

To start the app in dev mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm start`

For production mode

### `npm run test`

Run the test cases.

## Learn More

To learn Fastify, check out the [Fastify documentation](https://fastify.dev/docs/latest/).

## Choix Techniques

Dans le cadre de cet exercice, plusieurs décisions d'architecture et de conception ont été prises :

*   **Choix de Fastify** : Ce framework a été retenu pour tester ses performances et sa structure. L'adoption de Fastify a été grandement facilitée par l'usage du développement agentique (IA) pour cet exercice, permettant une mise en place rapide et efficace.
*   **Architecture modulaire (un dossier par route)** : Chaque route est isolée dans son propre sous-dossier contenant un fichier `index.ts` (par exemple, `src/routes/api/promocode/index.ts` et `src/routes/api/promocode/apply/index.ts`). Cette approche assure une plus grande clarté, une meilleure compartimentation du code et s'intègre parfaitement avec `@fastify/autoload`.
*   **Différenciation des messages d'erreur sur la restriction "or"** : Pour éviter toute confusion lors de l'application d'un promocode, les messages d'erreur liés aux restrictions logiques "or" ont été enrichis et différenciés. Si toutes les branches d'un groupe "or" échouent, le retour de l'API détaille précisément l'échec de chaque branche (ex: `or branch 1 failed: ...`), facilitant le débogage pour le consommateur de l'API.

