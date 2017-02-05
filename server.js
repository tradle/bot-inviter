const debug = require('debug')('tradle:bot:invite:server')
const express = require('express')
const Promise = require('bluebird')
const promisifyAll = Promise.promisifyAll
const STRINGS = require('./strings')

module.exports = function ({ bot, port }) {
  const app = express()
  const server = promisifyAll(app.listen(port))
  app.get('/confirmemail/:code', function (req, res) {
    const code = req.params.code
    const userId = bot.shared.get(code)
    if (!userId) {
      return res.status(404).send(STRINGS.PAGE_NOT_FOUND)
    }

    const user = bot.users.get(userId)
    if (!user) {
      return res.status(500).send(STRINGS.SOMETHING_WENT_WRONG)
    }

    user.emailConfirmed = true
    bot.users.save(user)
    bot.send({
      userId,
      object: STRINGS.EMAIL_CONFIRMED
    })

    res.send(STRINGS.EMAIL_CONFIRMED)
  })

  app.use(function defaultErrorHandler (err, req, res, next) {
    debug('something went wrong', err)
    res.status(500).send('Uh oh, something went wrong')
  })

  return server
}
