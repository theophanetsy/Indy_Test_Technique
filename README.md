# Getting Started with [Fastify-CLI](https://www.npmjs.com/package/fastify-cli)
This project was bootstrapped with Fastify-CLI.

## Configuration

Avant de lancer le projet, vous devez configurer les variables d'environnement.

1. Copiez le fichier `.env.example` en le nommant `.env` à la racine du projet :
   ```bash
   cp .env.example .env
   ```
2. Remplissez le fichier `.env` avec votre clé API OpenWeather :
   ```env
   OPENWEATHER_API_KEY=votre_cle_api_ici
   ```

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
*   **Validation stricte par Schémas JSON (Fastify + Ajv) :**
   Toutes les entrées API sont validées au niveau du transport par Fastify à l'aide de schémas JSON natifs (types de données, contraintes d'intervalles comme `percent: [0-100]`, champs requis). Les mauvaises requêtes sont ainsi rejetées avant même d'atteindre la logique métier.
*   **Différenciation des messages d'erreur sur la restriction "or"** : Pour éviter toute confusion lors de l'application d'un promocode, les messages d'erreur liés aux restrictions logiques "or" ont été enrichis et différenciés. Si toutes les branches d'un groupe "or" échouent, le retour de l'API détaille précisément l'échec de chaque branche (ex: `or branch 1 failed: ...`), facilitant le débogage pour le consommateur de l'API.

*   **Evaluation des restrictions** : Pour évaluer les restrictions complexe comme le 'and' et 'or', on utilise un **algorithme récursif d'évaluation d'arbre de décision** :

      - **Nœuds Feuilles (`age`, `date`, `weather`) :** Évalués individuellement par des fonctions spécifique. Si la condition n'est pas remplie, une chaîne décrivant l'échec est ajoutée à la liste des `reasons`.
      - **Nœuds Logiques (`and`) :** Évalue toutes ses branches enfants récursivement et fusionne l'intégralité de leurs raisons de refus. Si une branche échoue, on arrête l'évaluation et on retourne les raisons.
      - **Nœuds Logiques (`or`) :** Évalue toutes ses branches enfants. Si au moins une branche ne retourne aucune raison de refus (succès), le nœud `or` est validé. Si toutes les branches échouent, on retourne les erreurs de chaque branche préfixées (ex: `or branch 1 failed: ...`) pour un diagnostic précis.
   
*   **Optimisation des appels API Météo (Lazy-Loading) :**
   Avant d'interroger le service tiers OpenWeather, le validateur analyse récursivement l'arbre des restrictions pour déterminer si la météo est requise (`restrictionsNeedWeather`). Si le promocode ne contient aucune restriction météo, l'appel réseau est court-circuité.

*   **CI GitHub Actions robuste :**
   Le projet valide chaque push sur GitHub à l'aide d'un workflow CI qui gère proprement l'environnement Linux (`shopt -s globstar` pour le parsing des globs de test) et compile les fichiers TypeScript avec les bonnes configurations.


## Pistes d'amélioration pour la mise en production

### 1. Cache pour les requêtes météo (Rate Limiting)
L'API OpenWeather limite le forfait gratuit à 60 requêtes/minute. Si 1000 utilisateurs d'une même ville demandent à appliquer un code dans la même minute, l'API sera bloquée.
*   **Solution :** Implémenter un cache (ex: Redis ou cache mémoire TTL de 10 minutes) associant `ville` -> `météo`. La météo ne variant pas à la seconde près, cela économise des requêtes réseau et améliore radicalement le temps de réponse de l'API.

### 2. Base de données et persistance
Actuellement, les promocodes sont stockés dans un `Map` en mémoire. Tout redémarrage du serveur réinitialise les données.
*   **Solution :** Utiliser une base de données de type document (MongoDB) ou relationnelle (PostgreSQL avec Prisma) pour stocker les promocodes de façon durable.


### 3. Normalisation des fuseaux horaires (Timezones)
L'évaluation des restrictions de dates utilise `new Date()` (heure du serveur). Si les serveurs tournent sur AWS en Irlande (`UTC`) et que l'utilisateur est en France (`UTC+2`), un code valable jusqu'à minuit pourrait expirer à 22h pour l'utilisateur.
*   **Solution :** Traiter et comparer toutes les dates sous format ISO 8601 UTC ou forcer l'usage d'un fuseau horaire applicatif défini.
