const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const typeforce = require('typeforce')
const debug = require('debug')('tradle:bot:invite')
const extend = require('xtend/mutable')
const clone = require('clone')
const nodemailer = require('nodemailer')
const wellknown = require('nodemailer-wellknown')
const handlebars = require('handlebars')
const createServer = require('./server')
const DEFAULT_TEMPLATES = require('./templates')
const {
  co,
  promisifyAll,
  format,
  moan,
  humanize
} = require('./utils')

const DEFAULT_OPTS = {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS,
  service: process.env.EMAIL_SERVICE,
  from: process.env.EMAIL_FROM,
  host: process.env.HOST || 'localhost',
  port: process.env.PORT || 38917,
  inviterEmail: process.env.EMAIL_INVITER || process.env.EMAIL_USER,
  templates: DEFAULT_TEMPLATES
}

const STRINGS = require('./strings')
const BASIC_INFO_REQUEST = {
  _t: 'tradle.FormRequest',
  // hack: FormRequest currently doesn't display well without a product specified
  product: 'tradle.CurrentAccount',
  form: 'tradle.BetaTesterContactInfo',
  message: STRINGS.REQUEST_CONTACT_INFO
}

const TYPE = '_t'

module.exports = function createInviteBot (bot, opts={}) {
  const {
    service,
    auth,
    templates,
    from,
    host,
    port,
    inviterEmail
  } = normalizeOpts(opts)

  // create reusable transporter object using the default SMTP transport
  const transporter = promisifyAll(nodemailer.createTransport({
    service,
    auth
  }))

  // setup email data with unicode symbols
  const baseMailOptions = { from }
  const banterResponses = {
    spanish: function ({ user, object }) {
      debug('not speaking spanish')
      return bot.send({
        userId: user.id,
        object: STRINGS.PRESS_2
      })
    },
    '2': function ({ user, object }) {
      debug('speaking spanish')
      return bot.send({
        userId: user.id,
        object: STRINGS.SPANISH
      })
    },
    invite: co(function* ({ user, object }) {
      if (user.emailConfirmed) {
        return bot.send({
          userId: user.id,
          object: STRINGS.ALREADY_CONFIRMED
        })
      } else if (user.confirmEmailCode) {
        debug('sending email to ask user to confirm email')
        yield bot.send({
          userId: user.id,
          object: format(STRINGS.RESENDING_INVITE, user.profile.email)
        })
        return sendEmailWithConfirmationLink(user)
      }

      debug('send user basic contact info form')
      return bot.send({
        userId: user.id,
        object: BASIC_INFO_REQUEST
      })
    }),
    default: function ({ user, object }) {
      debug('send user instructions')
      return bot.send({
        userId: user.id,
        object: STRINGS.INSTRUCTIONS,
      })
    }
  }

  const sendEmailWithConfirmationLink = co(function* (user) {
    const { html, subject } = templates.email.invite(user, { host, port })
    yield sendEmail(extend({
      subject,
      html
    }, user.profile))

    debug(`sent an email to user ${user.id} at ${user.profile.email}`)
    yield bot.send({
      userId: user.id,
      object: `${moan()}.. ${moan()}... ${STRINGS.SENT_EMAIL}`
    })
  })

  function notifyInviter (invitee) {
    const emailData = templates.email.notifyInviter(invitee)
    return sendEmail(extend(emailData, { email: inviterEmail }))
  }

  function sendEmail ({ firstName, lastName, email, subject, html }) {
    const to = firstName && lastName
      ? `"${firstName} ${lastName}" <${email}>`
      : email

    debug(`sending email from ${from} to ${to} with subject: ${subject}`)
    const mailOptions = extend({
      to,
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
      .replace(/"/g, '') // in case the user types "invite" in quotes

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

    switch (object[TYPE]) {
      case 'tradle.SimpleMessage':
        return banter(data)
      case 'tradle.BetaTesterContactInfo':
        if (user.emailConfirmed) {
          return bot.send({
            userId: user.id,
            object: STRINGS.ALREADY_CONFIRMED
          })
        }

        user.profile = object
        if (!user.confirmEmailCode) {
          user.confirmEmailCode = crypto.randomBytes(32).toString('hex')
          bot.shared.set(user.confirmEmailCode, user.id)
          bot.users.save(user)
        }

        return sendEmailWithConfirmationLink(user)
      default:
        break
    }

    // fallback
    yield banterResponses.default(data)
  }))

  const onconfirmed = co(function* ({ user }) {
    const { emailConfirmed } = user
    let msg
    if (emailConfirmed) {
      msg = STRINGS.ALREADY_CONFIRMED
    } else {
      msg = STRINGS.EMAIL_CONFIRMED
      user.emailConfirmed = true
      bot.users.save(user)
      notifyInviter(user)
      bot.send({
        userId: user.id,
        object: msg
      })
    }

    return templates.page.confirmation({
      header: emailConfirmed ? STRINGS.NICE_TO_SEE_YOU_AGAIN : STRINGS.EXCELLENT,
      blocks: [{ body: msg }]
    })
  })

  const server = createServer({ bot, port, onconfirmed })
  return function cleanup () {
    removeHandler()
    return server.close()
  }
}

function normalizeOpts (opts) {
  const normalized = extend({}, DEFAULT_OPTS, opts)
  typeforce({
    user: 'String',
    pass: 'String',
    service: 'String',
    templates: 'Object'
  }, normalized)

  validateTemplateOpts(normalized.templates)
  const { user, pass, service, from, templates } = normalized
  normalized.auth = { user, pass }
  normalized.service = service.toLowerCase()
  const serviceConfig = wellknown(service)
  if (!serviceConfig) {
    throw new Error(`unsupported service ${service}, see https://nodemailer.com/smtp/well-known/`)
  }

  if (!normalized.from) {
    // TODO: this might not be right
    // check how nodemailer figures out the email
    const domain = serviceConfig.domains ? serviceConfig.domains[0] : serviceConfig.host
    normalized.from = user.indexOf('@') === -1 ? `${user}@${domain}` : user
    debug(`warn: as "from" was not specified, defaulting to ${from}`)
  }

  return normalized
}

function validateTemplateOpts (opts) {
  typeforce({
    email: 'Object',
    page: 'Object'
  }, opts)

  typeforce({
    invite: 'Function',
    notifyInviter: 'Function',
  }, opts.email)

  typeforce({
    confirmation: 'Function'
  }, opts.page)
}
