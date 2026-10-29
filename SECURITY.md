# Politique de sécurité

## Versions concernées

Le projet est en développement actif : seule la dernière version de la branche `main` reçoit des correctifs.

## Signaler une vulnérabilité

**Ne publie pas la faille dans une issue publique.** Utilise plutôt le signalement privé de GitHub :
**onglet Security → Report a vulnerability** de ce dépôt.

Décris : ce que tu as trouvé, comment le reproduire, l'impact possible et, si tu en as une, une piste de correction. Tu recevras une réponse dès que possible, et nous te tiendrons informé·e de l'avancement jusqu'au correctif. Nous mentionnerons volontiers ta contribution (si tu le souhaites) dans les notes de version.

## Périmètre

Le serveur fourni (`server/server.js`) est un **serveur de test local** pour développer le jeu : il n'a ni authentification, ni HTTPS, ni limitation de débit. Il n'est **pas** conçu pour être exposé tel quel sur Internet. Les noms de joueurs et les scores qu'il stocke ne sont pas des données sensibles, mais si tu le déploies publiquement, place-le derrière un reverse proxy (HTTPS, limitation de débit) et ne stocke pas de données personnelles.

Sont dans le périmètre : injection ou écriture de fichiers via le serveur, contournement du chemin de fichiers statiques, XSS dans l'interface (noms de joueurs, classement), corruption de la base SQLite par des requêtes malformées.
