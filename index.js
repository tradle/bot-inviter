const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const co = Promise.coroutine
const promisifyAll = Promise.promisifyAll
const debug = require('debug')('tradle:bot:invite')
const extend = require('xtend/mutable')
const clone = require('clone')
const omit = require('object.omit')
const nodemailer = require('nodemailer')
const wellknown = require('nodemailer-wellknown')
const handlebars = require('handlebars')
const createServer = require('./server')
const { format, moan } = require('./utils')
const EMAIL_TEMPLATE_PATH = path.resolve(__dirname, './templates/confirm-email/index-inlined-styles.hbs')
const DEFAULT_CONFIRM_EMAIL_TEMPLATE_ARGS = {
  action: {
    text: 'Confirm Email Address'
  },
  blocks: [
    { body: 'Please confirm your email address by clicking the link below' },
    { body: 'Once you do, we can send you an invitation to install the Tradle iOS app' }
  ],
  signature: 'Tradle team',
  twitter: 'tradles'
}

const STRINGS = require('./strings')
const BASIC_INFO_REQUEST = {
  _t: 'tradle.FormRequest',
  // hack: FormRequest currently doesn't display well without a product specified
  product: 'tradle.CurrentAccount',
  form: 'tradle.BasicContactInfo',
  message: STRINGS.REQUEST_CONTACT_INFO
}

module.exports = function createInviteBot (bot, opts={}) {
  let {
    user,
    pass,
    templatePath=EMAIL_TEMPLATE_PATH,
    host='localhost',
    port=8001,
    service
  } = opts

  if (!(user && pass && service)) {
    throw new Error('expected "user", "pass", and "service"')
  }

  service = opts.service.toLowerCase()
  const serviceConfig = wellknown(service)
  if (!serviceConfig) {
    throw new Error(`unsupported service ${service}, see https://nodemailer.com/smtp/well-known/`)
  }

  let from = opts.from
  if (!from) {
    // TODO: this might not be right
    // check how nodemailer figures out the email
    const domain = serviceConfig.domains ? serviceConfig.domains[0] : serviceConfig.host
    from = opts.user.indexOf('@') === -1 ? `${opts.user}@${domain}` : opts.user
    debug(`warn: as "from" was not specified, defaulting to ${from}`)
  }

  const templateSource = fs.readFileSync(templatePath, { encoding: 'utf8' })
  const template = handlebars.compile(templateSource)

  // create reusable transporter object using the default SMTP transport
  const transporter = promisifyAll(nodemailer.createTransport({
    service,
    auth: { user, pass }
  }))

  // setup email data with unicode symbols
  const baseMailOptions = { from }
  const banterResponses = {
    '2': function ({ user, object }) {
      debug('speaking spanish')
      return bot.send({
        userId: user.id,
        object: STRINGS.SPANISH
      })
    },
    invite: co(function* ({ user, object }) {
      if (user.confirmEmailCode) {
        debug('sending email to ask user to confirm email')
        yield bot.send({
          userId: user.id,
          object: format(STRINGS.RESENDING_INVITE, user.email)
        })
        return sendEmailWithConfirmationLink(user)
      } else {
        debug('send user basic contact info form')
        return bot.send({
          userId: user.id,
          object: BASIC_INFO_REQUEST
        })
      }
    }),
    default: function ({ user, object }) {
      debug('send user instructions')
      return bot.send({
        userId: user.id,
        object: STRINGS.INSTRUCTIONS,
      })
    }
  }

  function genConfirmEmail (user) {
    if (!user.confirmEmailCode) {
      user.confirmEmailCode = crypto.randomBytes(32).toString('hex')
      bot.shared.set(user.confirmEmailCode, user.id)
      bot.users.save(user)
    }

    const subject = STRINGS.DEFAULT_SUBJECT
    const args = clone(DEFAULT_CONFIRM_EMAIL_TEMPLATE_ARGS)
    args.blocks.unshift({
      body: `Hi ${user.firstName}!`
    })

    args.action.link = `http://${host}:${port}/confirmemail/${user.confirmEmailCode}`
    const html = template(args)
    return { html, subject }
  }

  const sendEmailWithConfirmationLink = co(function* (user) {
    const { html, subject } = genConfirmEmail(user)
    const { messageId, response } = yield sendEmail({ user, subject, html })
    debug(`sent an email to user ${user.id} at ${user.email}`)
    yield bot.send({
      userId: user.id,
      object: `${moan()}.. ${moan()}... ${STRINGS.SENT_EMAIL}`
    })
  })

  function sendEmail ({ user, subject, html }) {
    const { firstName, lastName, email } = user
    const mailOptions = extend({
      to: `"${firstName} ${lastName}" <${email}>`,
      subject,
      html
    }, baseMailOptions)

    // send mail with defined transport object
    return transporter.sendMail(mailOptions)
  }

  function banter (incoming) {
    const { user, object } = incoming
    const text = object.message
      .toLowerCase()
      .trim()
      .replace(/\"/g, '') // in case the user types "invite" in quotes

    const respond = banterResponses[text] || banterResponses.default
    return respond(incoming)
  }

  const removeHandler = bot.addReceiveHandler(co(function* (data) {
    const { user, object } = data
    if (!user.history.length) {
      // first encounter
      yield bot.send({
        userId: user.id,
        object: STRINGS.GREETING,
      })

      // keep going
    }

    switch (object._t) {
      case 'tradle.SimpleMessage':
        return banter(data)
      case 'tradle.BasicContactInfo':
        if (user.emailConfirmed) {
          return bot.send({
            userId: user.id,
            object: STRINGS.ALREADY_CONFIRMED
          })
        }

        extend(user, omit(object, '_t'))
        return sendEmailWithConfirmationLink(user)
    }

    // fallback
    yield banterResponses.default(data)
  }))

  const server = createServer({ bot, port })
  return function cleanup () {
    removeHandler()
    return server.close()
  }
}
