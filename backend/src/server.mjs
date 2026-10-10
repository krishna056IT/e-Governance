import app from './app.mjs'
import { env } from './config/env.mjs'
import { startDatabaseConnectionMonitor } from './config/database.mjs'
import { startOverdueStaffTaskProcessor } from './services/staffTaskService.mjs'

const port = env.PORT

async function startServer() {
  startDatabaseConnectionMonitor()
  startOverdueStaffTaskProcessor()
  app.listen(port, () => {
    console.log(`HacKBios backend listening on port ${port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start HacKBios backend.', error)
  process.exitCode = 1
})
