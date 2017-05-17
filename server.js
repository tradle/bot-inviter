const debug = require('debug')('tradle:bot:invite:server')
const express = require('express')
const wrap = require('co-express')

const STRINGS = require('./strings')

module.exports = function createConfirmationServer ({ bot, router, port, processConfirmationCode, renderConfirmationPage }) {
  const app = router || express()
  const server = router ? null : app.listen(port)
  app.get('/confirmemail/:code', wrap(function* (req, res) {
    const code = req.params.code
    try {
      const { user, wasConfirmed } = yield processConfirmationCode({ code })
      const page = renderConfirmationPage({ user, wasConfirmed })
      res.send(page)
    } catch (err) {
      return res.status(404).send(STRINGS.PAGE_NOT_FOUND)
    }
  }))

  app.use(function defaultErrorHandler (err, req, res, next) {
    debug('something went wrong', err)
    res.status(500).send('Uh oh, something went wrong')
  })

  return server
}
