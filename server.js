const debug = require('debug')('tradle:bot:invite:server')
const express = require('express')
const wrap = require('co-express')
const {
  promisifyAll
} = require('./utils')

const STRINGS = require('./strings')

module.exports = function createConfirmationServer ({ bot, port, onconfirmed }) {
  const app = express()
  const server = promisifyAll(app.listen(port))
  app.get('/confirmemail/:code', wrap(function* (req, res) {
    const code = req.params.code
    const userId = bot.shared.get(code)
    if (!userId) {
      return res.status(404).send(STRINGS.PAGE_NOT_FOUND)
    }

    const user = bot.users.get(userId)
    if (!user) {
      return res.status(500).send(STRINGS.SOMETHING_WENT_WRONG)
    }

    const responseMsg = yield onconfirmed({ user })
    res.send(responseMsg)
  }))

  app.use(function defaultErrorHandler (err, req, res, next) {
    debug('something went wrong', err)
    res.status(500).send('Uh oh, something went wrong')
  })

  return server
}
