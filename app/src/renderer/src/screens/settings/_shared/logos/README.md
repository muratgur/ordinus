# Connector logos

Drop official brand SVGs here to replace the brand-colored monogram fallback in
`ConnectorIcon`. The filename must match the connector id exactly:

| Connector | File to add      | Where to get the official mark        |
| --------- | ---------------- | ------------------------------------- |
| Datadog   | `datadog.svg`    | Datadog brand / press kit             |
| Linear    | `linear.svg`     | Linear brand assets                   |
| Notion    | `notion.svg`     | Notion brand guidelines               |
| Canva     | `canva.svg`      | Canva brand kit                       |
| LinkedIn  | `linkedin.svg`   | LinkedIn brand resources              |
| WhatsApp  | `whatsapp.svg`   | WhatsApp brand center                 |
| Atlassian | `atlassian.svg`  | Atlassian design / brand              |
| Google    | `google.svg`     | Google brand permissions (the "G")    |

No file needed for `dev-fixture` — the monogram is fine for the local test connector.

The tile renders the SVG on a white background at 40×40 with padding, so a
standard square or wordmark logo works. Once a file is present it is picked up
automatically (Vite `import.meta.glob`); no code change required.
