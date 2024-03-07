import { _getQueryParam, convertToURL } from './request-utils'
import { _isNull } from './type-utils'
import { Properties } from '../types'
import Config from '../config'
import { _each, _extend, _strip_empty_properties, _timestamp } from './index'
import { assignableWindow, document, location, userAgent, window } from './globals'
import { detectBrowser, detectBrowserVersion, detectDevice, detectDeviceType, detectOS } from './user-agent-utils'

const URL_REGEX_PREFIX = 'https?://(.*)'

export const _info = {
    campaignParams: function (customParams?: string[]): Record<string, any> {
        // Should be kept in sync with https://github.com/PostHog/posthog/blob/master/plugin-server/src/utils/db/utils.ts#L60
        const campaign_keywords = [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_content',
            'utm_term',
            'gclid', // google ads
            'gad_source', // google ads
            'gclsrc', // google ads 360
            'dclid', // google display ads
            'gbraid', // google ads, web to app
            'wbraid', // google ads, app to web
            'fbclid', // facebook
            'msclkid', // microsoft
            'twclid', // twitter
            'li_fat_id', // linkedin
            'mc_cid', // mailchimp campaign id
            'igshid', // instagram
            'ttclid', // tiktok
        ].concat(customParams || [])

        const params: Record<string, any> = {}
        _each(campaign_keywords, function (kwkey) {
            const kw = document ? _getQueryParam(document.URL, kwkey) : ''
            if (kw.length) {
                params[kwkey] = kw
            }
        })

        return params
    },

    searchEngine: function (): string | null {
        const referrer = document?.referrer
        if (!referrer) {
            return null
        } else {
            if (referrer.search(URL_REGEX_PREFIX + 'google.([^/?]*)') === 0) {
                return 'google'
            } else if (referrer.search(URL_REGEX_PREFIX + 'bing.com') === 0) {
                return 'bing'
            } else if (referrer.search(URL_REGEX_PREFIX + 'yahoo.com') === 0) {
                return 'yahoo'
            } else if (referrer.search(URL_REGEX_PREFIX + 'duckduckgo.com') === 0) {
                return 'duckduckgo'
            } else {
                return null
            }
        }
    },

    searchInfo: function (): Record<string, any> {
        const search = _info.searchEngine(),
            param = search != 'yahoo' ? 'q' : 'p',
            ret: Record<string, any> = {}

        if (!_isNull(search)) {
            ret['$search_engine'] = search

            const keyword = document ? _getQueryParam(document.referrer, param) : ''
            if (keyword.length) {
                ret['ph_keyword'] = keyword
            }
        }

        return ret
    },

    /**
     * This function detects which browser is running this script.
     * The order of the checks are important since many user agents
     * include keywords used in later checks.
     */
    browser: detectBrowser,

    /**
     * This function detects which browser version is running this script,
     * parsing major and minor version (e.g., 42.1). User agent strings from:
     * http://www.useragentstring.com/pages/useragentstring.php
     *
     * `navigator.vendor` is passed in and used to help with detecting certain browsers
     * NB `navigator.vendor` is deprecated and not present in every browser
     */
    browserVersion: detectBrowserVersion,

    browserLanguage: function (): string {
        return (
            navigator.language || // Any modern browser
            (navigator as Record<string, any>).userLanguage // IE11
        )
    },

    os: detectOS,

    device: detectDevice,

    deviceType: detectDeviceType,

    referrer: function (): string {
        return document?.referrer || '$direct'
    },

    referringDomain: function (): string {
        if (!document?.referrer) {
            return '$direct'
        }
        return convertToURL(document.referrer)?.host || '$direct'
    },

    properties: function (): Properties {
        if (!userAgent) {
            return {}
        }
        const [os_name, os_version] = _info.os(userAgent)
        return _extend(
            _strip_empty_properties({
                $os: os_name,
                $os_version: os_version,
                $browser: _info.browser(userAgent, navigator.vendor, assignableWindow.opera),
                $device: _info.device(userAgent),
                $device_type: _info.deviceType(userAgent),
            }),
            {
                $current_url: location?.href,
                $host: location?.host,
                $pathname: location?.pathname,
                $raw_user_agent: userAgent.length > 1000 ? userAgent.substring(0, 997) + '...' : userAgent,
                $browser_version: _info.browserVersion(userAgent, navigator.vendor, assignableWindow.opera),
                $browser_language: _info.browserLanguage(),
                $screen_height: window?.screen.height,
                $screen_width: window?.screen.width,
                $viewport_height: window?.innerHeight,
                $viewport_width: window?.innerWidth,
                $lib: 'web',
                $lib_version: Config.LIB_VERSION,
                $insert_id: Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10),
                $time: _timestamp() / 1000, // epoch time in seconds
            }
        )
    },

    people_properties: function (): Properties {
        if (!userAgent) {
            return {}
        }

        const [os_name, os_version] = _info.os(userAgent)
        return _extend(
            _strip_empty_properties({
                $os: os_name,
                $os_version: os_version,
                $browser: _info.browser(userAgent, navigator.vendor, assignableWindow.opera),
            }),
            {
                $browser_version: _info.browserVersion(userAgent, navigator.vendor, assignableWindow.opera),
            }
        )
    },
}
