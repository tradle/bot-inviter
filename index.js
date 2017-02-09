const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const debug = require('debug')('tradle:bot:invite')
const extend = require('xtend/mutable')
const clone = require('clone')
const nodemailer = require('nodemailer')
const wellknown = require('nodemailer-wellknown')
const handlebars = require('handlebars')
const createServer = require('./server')
const {
  co,
  promisifyAll,
  format,
  moan,
  humanize
} = require('./utils')

const templates = (function loadTemplates () {
  const dirs = {
    confirmEmail: './templates/confirm-email/',
    notifyInviter: './templates/notify-email/'
  }

  const templates = {}
  for (let name in dirs) {
    let file = path.resolve(__dirname, dirs[name], 'index-inlined-styles.hbs')
    templates[name] = fs.readFileSync(file, { encoding: 'utf8' })
  }

  return templates
}())

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

const DEFAULT_NOTIFY_INVITER_EMAIL_TEMPLATE_ARGS = {
  blocks: [],
  signature: 'Inviter bot'
}

const DEFAULT_OPTS = {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS,
  service: process.env.EMAIL_SERVICE,
  from: process.env.EMAIL_FROM,
  confirmEmailTemplate: templates.confirmEmail,
  notifyInviterTemplate: templates.notifyInviter,
  host: process.env.HOST || 'localhost',
  port: process.env.PORT || 38917,
  inviterEmail: 'mark@tradle.io'
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
    confirmEmailTemplate,
    notifyInviterTemplate,
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

  function genConfirmEmail (user) {
    const subject = STRINGS.DEFAULT_SUBJECT
    const args = clone(DEFAULT_CONFIRM_EMAIL_TEMPLATE_ARGS)
    args.blocks.unshift({
      body: `Hi ${user.profile.firstName}!`
    })

    args.action.link = `http://${host}:${port}/confirmemail/${user.confirmEmailCode}`
    const html = confirmEmailTemplate(args)
    return { html, subject }
  }

  /**
   * @param  {Object} user the invitee
   */
  function genNotifyInviterEmail (user) {
    const subject = format(STRINGS.NOTIFY_INVITER, user.profile.firstName, user.profile.lastName)
    const args = clone(DEFAULT_NOTIFY_INVITER_EMAIL_TEMPLATE_ARGS)
    args.blocks.push({ body: STRINGS.APPLICATION_DETAILS })
    const profile = user.profile
    for (let prop in profile) {
      if (prop[0] === '_') continue

      let val = profile[prop]
      // TODO: use the underlying model
      if (typeof val === 'number' && isDateOrTime(prop)) {
        val = new Date(val)
      }

      args.blocks.push({
        body: `${humanize(prop)}: ${val}`
      })
    }

    const html = notifyInviterTemplate(args)
    return { html, subject }
  }

  const sendEmailWithConfirmationLink = co(function* (user) {
    const { html, subject } = genConfirmEmail(user)
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
    const emailData = genNotifyInviterEmail(invitee)
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
    const msg = user.emailConfirmed
      ? STRINGS.ALREADY_CONFIRMED
      : STRINGS.EMAIL_CONFIRMED

    if (!user.emailConfirmed) {
      user.emailConfirmed = true
      bot.users.save(user)
    }

    yield bot.send({
      userId: user.id,
      object: msg
    })

    yield notifyInviter(user)
    return msg
  })

  const server = createServer({ bot, port, onconfirmed })
  return function cleanup () {
    removeHandler()
    return server.close()
  }
}

function normalizeOpts (opts) {
  opts = extend({}, DEFAULT_OPTS, opts)
  let {
    user,
    pass,
    service,
    host,
    port,
    from,
    inviterEmail,
    notifyInviterTemplate,
    confirmEmailTemplate
  } = opts

  if (!(user && pass && service && inviterEmail)) {
    throw new Error('expected "user", "pass", "service", and "inviterEmail"')
  }

  service = service.toLowerCase()
  const serviceConfig = wellknown(service)
  if (!serviceConfig) {
    throw new Error(`unsupported service ${service}, see https://nodemailer.com/smtp/well-known/`)
  }

  if (!from) {
    // TODO: this might not be right
    // check how nodemailer figures out the email
    const domain = serviceConfig.domains ? serviceConfig.domains[0] : serviceConfig.host
    from = user.indexOf('@') === -1 ? `${user}@${domain}` : user
    debug(`warn: as "from" was not specified, defaulting to ${from}`)
  }

  return {
    service,
    auth: { user, pass },
    host,
    port,
    from,
    inviterEmail,
    notifyInviterTemplate: handlebars.compile(notifyInviterTemplate),
    confirmEmailTemplate: handlebars.compile(confirmEmailTemplate)
  }
}

function isDateOrTime (prop) {
  return (/date|time/).test(prop)
}
