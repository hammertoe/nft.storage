#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import fetch from '@web-std/fetch'
import {
  basicAuthorizationHeaderValue,
  measureNftTimeToRetrievability,
} from '../jobs/measureNftTimeToRetrievability.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { EnvironmentLoader } from 'safe-env-vars'
import { ConsoleLog, JSONLogger } from '../lib/log.js'
import process from 'process'
import { RandomImage, RandomImageBlob } from '../lib/random.js'
import assert from 'assert'

const env = new EnvironmentLoader()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** @ts-ignore */
global.fetch = fetch

/** @type {import('../lib/log.js').LogFunction} */
const defaultLog = (level, ...loggables) => {
  JSONLogger(ConsoleLog())(level, ...loggables)
}

/**
 * @param {string[]} argv
 * @param {object} [options]
 * @param {import('../lib/log.js').LogFunction} options.log
 */
export async function main(argv, options = { log: defaultLog }) {
  const [command, ...commandArgv] = argv
  /**
   * @param  {string[]} commandArgv
   */
  const measureArgs = async (...commandArgv) => {
    const commandArgs = await yargs(commandArgv).options({
      url: {
        type: 'string',
        default: 'https://nft.storage',
      },
      metricsPushGateway: {
        type: 'string',
      },
      minImageSizeBytes: {
        type: 'number',
        default: 1000,
      },
      logConfigAndExit: {
        type: 'boolean',
        default: false,
      },
      gateways: {
        alias: 'gateway',
        type: 'string',
        array: true,
        default: 'https://nftstorage.link',
      },
    }).argv
    /** @type {AsyncIterable<Blob>} */
    const images = (async function* () {
      let count = 1
      while (count--) {
        /** @type {Blob} */
        const blob = await RandomImageBlob(
          RandomImage({
            bytes: {
              min: commandArgs.minImageSizeBytes,
            },
          })
        )
        yield blob
      }
    })()
    const { gateways: gatewaysYargs } = commandArgs
    /** @type {URL[]} */
    const gateways = (
      Array.isArray(gatewaysYargs) ? gatewaysYargs : [gatewaysYargs]
    ).map((s) => new URL(s))
    return {
      ...commandArgs,
      gateways,
      log: options.log,
      images,
    }
  }
  const PUSHGATEWAY_BASIC_AUTH = env.optional.string.get(
    'PUSHGATEWAY_BASIC_AUTH'
  )
  switch (command) {
    case 'measure':
      await measureNftTimeToRetrievability(
        {
          ...(await measureArgs(...commandArgv)),
        },
        {
          nftStorageToken: env.string.get('NFT_STORAGE_API_KEY'),
          metricsPushGatewayAuthorization: PUSHGATEWAY_BASIC_AUTH
            ? parseBasicAuth(PUSHGATEWAY_BASIC_AUTH)
            : { authorization: 'bearer no-auth' },
        }
      )
      break
    default:
      throw new Error(`unexpected command ${command}`)
  }
}

/**
 * Parse PUSHGATEWAY_BASIC_AUTH auth value
 * @param {string} basicAuthEnvVarString
 * @returns {import('../jobs/measureNftTimeToRetrievability.js').HttpAuthorization}
 */
function parseBasicAuth(basicAuthEnvVarString) {
  assert.ok(basicAuthEnvVarString)
  const [username, ...passwordParts] = basicAuthEnvVarString.split(':')
  const password = passwordParts.join(':')
  return {
    authorization: basicAuthorizationHeaderValue({ username, password }),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: path.join(__dirname, '../../../../.env') })
  main(hideBin(process.argv))
}
