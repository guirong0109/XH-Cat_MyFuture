import { createApp } from './app.js'

const port = process.env.PORT || 3200
createApp().listen(port, () => console.log(`FutureReady MY (CV/profile module) on http://localhost:${port}`))
