'use strict'

const Block = require('ipfs-block')
const multihashing = require('multihashing-async')
const CID = require('cids')
const callbackify = require('callbackify')
const errCode = require('err-code')

module.exports = function block (self) {
  return {
    get: callbackify.variadic(async (cid, options) => { // eslint-disable-line require-await
      options = options || {}

      try {
        cid = cleanCid(cid)
      } catch (err) {
        throw errCode(err, 'ERR_INVALID_CID')
      }

      if (options.preload !== false) {
        self._preload(cid)
      }

      return self._blockService.get(cid)
    }),
    put: callbackify.variadic(async (block, options) => {
      options = options || {}

      if (Array.isArray(block)) {
        throw new Error('Array is not supported')
      }

      if (!Block.isBlock(block)) {
        if (options.cid && CID.isCID(options.cid)) {
          block = new Block(block, options.cid)
        } else {
          const mhtype = options.mhtype || 'sha2-256'
          const format = options.format || 'dag-pb'
          let cidVersion

          if (options.version == null) {
            // Pick appropriate CID version
            cidVersion = mhtype === 'sha2-256' && format === 'dag-pb' ? 0 : 1
          } else {
            cidVersion = options.version
          }

          const multihash = await multihashing(block, mhtype)
          const cid = new CID(cidVersion, format, multihash)

          block = new Block(block, cid)
        }
      }

      const release = await self._gcLock.readLock()

      try {
        await self._blockService.put(block)

        if (options.preload !== false) {
          self._preload(block.cid)
        }

        return block
      } finally {
        release()
      }
    }),
    rm: callbackify(async (cid) => {
      try {
        cid = cleanCid(cid)
      } catch (err) {
        throw errCode(err, 'ERR_INVALID_CID')
      }

      // We need to take a write lock here to ensure that adding and removing
      // blocks are exclusive operations
      const release = await self._gcLock.writeLock()

      try {
        await self._blockService.delete(cid)
      } finally {
        release()
      }
    }),
    stat: callbackify.variadic(async (cid, options) => {
      options = options || {}

      try {
        cid = cleanCid(cid)
      } catch (err) {
        throw errCode(err, 'ERR_INVALID_CID')
      }

      if (options.preload !== false) {
        self._preload(cid)
      }

      const block = await self._blockService.get(cid)

      return {
        key: cid.toString(),
        size: block.data.length
      }
    })
  }
}

function cleanCid (cid) {
  if (CID.isCID(cid)) {
    return cid
  }

  // CID constructor knows how to do the cleaning :)
  return new CID(cid)
}
