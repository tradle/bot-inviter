const crypto = require('crypto')
const ip = require('ip')
const typeforce = require('typeforce')
const extend = require('xtend/mutable')
const shallowClone = require('xtend')
const shallowExtend = require('xtend/mutable')
const nodemailer = require('nodemailer')
const wellknown = require('nodemailer-wellknown')
const createServer = require('./server')
const {
  co,
  promisifyAll,
  debug
} = require('./utils')

const DEFAULT_OPTS = {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS,
  service: process.env.EMAIL_SERVICE,
  from: process.env.EMAIL_FROM,
  host: process.env.HOST || ip.address(),
  port: process.env.PORT || 38917,
  inviterEmail: process.env.EMAIL_INVITER || process.env.EMAIL_USER
}

const moduleName = require('./package.json').name
const promiseNoop = () => Promise.resolve()

module.exports = function createInviteBot (bot, opts={}) {
  const {
    service,
    auth,
    from,
    host,
    port,
    router,
    inviterEmail,
    renderConfirmationPage,
    onConfirmed=promiseNoop,
    storageKey=moduleName
  } = normalizeOpts(opts)

  // create reusable transporter object using the default SMTP transport
  const transporter = promisifyAll(nodemailer.createTransport({
    service,
    auth
  }))

  // setup email data with unicode symbols
  const baseMailOptions = { from }
  const emailConfirmationLink = co(function* (opts) {
    const { user, firstName, lastName, email, template } = opts
    if (!template) throw new Error('expected "template" function')

    let confirmationCode
    const storage = ensureInviterStorage({ user })
    confirmationCode = storage.confirmationCode
    if (!confirmationCode) {
      storage.email = email
      storage.confirmationCode = confirmationCode = newCode()
      const key = getConfirmationCodeToUserStorageKey(confirmationCode)
      yield Promise.all([
        bot.shared.set(key, user.id),
        bot.users.save(user)
      ])
    }

    const emailData = template({
      user,
      host,
      port,
      confirmationCode
    })

    const sendOpts = shallowClone(opts, emailData)
    yield sendEmail(sendOpts)
  })

  const emailInvite = co(function* (opts) {
    const { inviter, firstName, lastName, email, template } = opts
    if (!template) throw new Error('expected "template" function')

    const confirmationCode = newCode()
    yield bot.shared.set(getConfirmationCodeToEmailStorageKey(confirmationCode), { email, inviter: inviter.id })
    console.log('confirmation code: ' + confirmationCode)
    const emailData = template({
      inviter,
      host,
      port,
      confirmationCode
    })

    const sendOpts = shallowClone(opts, emailData)
    yield sendEmail(sendOpts)
  })

  function getConfirmationCodeToUserStorageKey (code) {
    return 'inviter:user:code' + code
  }

  function getConfirmationCodeToEmailStorageKey (code) {
    return 'inviter:email:code' + code
  }

  function sendEmail (opts) {
    typeforce({
      email: 'String',
      subject: 'String',
      html: 'String',
      firstName: '?String',
      lastName: '?String'
    }, opts)

    const { user, firstName, lastName, email, subject, html } = opts
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

  const processConfirmationCode = co(function* ({ code, user }) {
    let invitation
    try {
      const userId = yield bot.shared.get(getConfirmationCodeToUserStorageKey(code))
      user = yield bot.users.get(userId)
    } catch (err) {
      if (!user) throw new Error('expected "user"')

      invitation = yield bot.shared.get(getConfirmationCodeToEmailStorageKey(code))
    }

    const storage = ensureInviterStorage({ user })
    if (invitation) {
      shallowExtend(storage, invitation)
    }

    const { email, inviter } = storage
    const wasConfirmed = storage.emailConfirmed
    if (!wasConfirmed) {
      storage.emailConfirmed = true
      yield bot.users.save(user)
    }

    yield onConfirmed({ user, wasConfirmed, email })
    return { user, wasConfirmed, email, inviter }
  })

  function ensureInviterStorage ({ user }) {
    if (!user[storageKey]) {
      user[storageKey] = {}
    }

    return user[storageKey]
  }

  const api = {
    emailConfirmationLink,
    emailInvite,
    sendEmail,
    server: createServer({
      router,
      bot,
      port,
      processConfirmationCode,
      renderConfirmationPage
    }),
    hasConfirmedEmail: ({ user }) => {
      return user[storageKey] && user[storageKey].emailConfirmed
    },
    hasSentInvite: ({ user }) => {
      return user[storageKey] && user[storageKey].confirmationCode
    },
    processConfirmationCode,
    host,
    port
  }

  return api
}

function normalizeOpts (opts) {
  const normalized = extend({}, DEFAULT_OPTS, opts)
  typeforce({
    user: 'String',
    pass: 'String',
    service: 'String'
  }, normalized)

  const { user, pass, service, from } = normalized
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

function newCode () {
  return crypto.randomBytes(16).toString('hex')
}
