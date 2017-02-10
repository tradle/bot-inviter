
# @tradle/bot-inviter

A bot that invites people to confirm their email address. This is what people do now.

## Usage 

### Install

```js
yarn add https://github.com/tradle/bot-inviter
```

### In code / Console

```js
const inviter = require('@tradle/bot-inviter')
bot.use(inviter, {
  // the account from which to send emails to users
  service: 'gmail',
  user: 'mark@tradle.io',
  pass: 'no really, this is my password',
  // notify this guy when a user confirms their email
  inviterEmail: 'someone@somewhere.cool',
  // confirmation emails sent to users will link back to your server
  host: 'localhost',
  port: 8000
})
```
