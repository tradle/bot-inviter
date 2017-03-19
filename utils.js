const Promise = require('bluebird')

exports.Promise = Promise
exports.co = Promise.coroutine
exports.promisifyAll = Promise.promisifyAll
exports.debug = require('debug')('tradle:bot:invite')
