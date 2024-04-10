import { autocapture } from '../autocapture'
import { Decide } from '../decide'
import { PostHogPersistence } from '../posthog-persistence'
import { RequestRouter } from '../utils/request-router'

const expectDecodedSendRequest = (send_request, data, noCompression) => {
    const lastCall = send_request.mock.calls[send_request.mock.calls.length - 1]

    const decoded = lastCall[0].data
    // Helper to give us more accurate error messages
    expect(decoded).toEqual(data)

    expect(given.posthog._send_request).toHaveBeenCalledWith({
        url: 'https://test.com/decide/?v=3',
        data,
        method: 'POST',
        callback: expect.any(Function),
        compression: noCompression ? undefined : 'base64',
        timeout: undefined,
    })
}

const checkScriptsForSrc = (src, negate = false) => {
    const scripts = document.querySelectorAll('body > script')
    let foundScript = false
    for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src === src) {
            foundScript = true
            break
        }
    }

    if (foundScript && negate) {
        throw new Error(`Script with src ${src} was found when it should not have been.`)
    } else if (!foundScript && !negate) {
        throw new Error(`Script with src ${src} was not found when it should have been.`)
    } else {
        return true
    }
}

describe('Decide', () => {
    given('decide', () => new Decide(given.posthog))
    given('posthog', () => ({
        config: given.config,
        persistence: new PostHogPersistence(given.config),
        register: (props) => given.posthog.persistence.register(props),
        unregister: (key) => given.posthog.persistence.unregister(key),
        get_property: (key) => given.posthog.persistence.props[key],
        capture: jest.fn(),
        _addCaptureHook: jest.fn(),
        _afterDecideResponse: jest.fn(),
        get_distinct_id: jest.fn().mockImplementation(() => 'distinctid'),
        _send_request: jest.fn().mockImplementation(({ callback }) => callback?.({ config: given.decideResponse })),
        toolbar: {
            maybeLoadToolbar: jest.fn(),
            afterDecideResponse: jest.fn(),
        },
        sessionRecording: {
            afterDecideResponse: jest.fn(),
        },
        featureFlags: {
            receivedFeatureFlags: jest.fn(),
            setReloadingPaused: jest.fn(),
            _startReloadTimer: jest.fn(),
        },
        requestRouter: new RequestRouter({ config: given.config }),
        _hasBootstrappedFeatureFlags: jest.fn(),
        getGroups: () => ({ organization: '5' }),
    }))

    given('decideResponse', () => ({ enable_collect_everything: true }))

    given('config', () => ({ api_host: 'https://test.com', persistence: 'memory' }))

    beforeEach(() => {
        jest.spyOn(autocapture, 'afterDecideResponse').mockImplementation()
        // clean the JSDOM to prevent interdependencies between tests
        document.body.innerHTML = ''
        document.head.innerHTML = ''
    })

    describe('constructor', () => {
        given('subject', () => () => given.decide.call())

        given('config', () => ({
            api_host: 'https://test.com',
            token: 'testtoken',
            persistence: 'memory',
        }))

        it('should call instance._send_request on constructor', () => {
            given.subject()

            expectDecodedSendRequest(given.posthog._send_request, {
                token: 'testtoken',
                distinct_id: 'distinctid',
                groups: { organization: '5' },
            })
        })

        it('should send all stored properties with decide request', () => {
            given.posthog.register({
                $stored_person_properties: { key: 'value' },
                $stored_group_properties: { organization: { orgName: 'orgValue' } },
            })
            given.subject()

            expectDecodedSendRequest(given.posthog._send_request, {
                token: 'testtoken',
                distinct_id: 'distinctid',
                groups: { organization: '5' },
                person_properties: { key: 'value' },
                group_properties: { organization: { orgName: 'orgValue' } },
            })
        })

        it('should send disable flags with decide request when config is set', () => {
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
                advanced_disable_feature_flags: true,
            }))
            given.posthog.register({
                $stored_person_properties: { key: 'value' },
                $stored_group_properties: { organization: { orgName: 'orgValue' } },
            })
            given.subject()

            expectDecodedSendRequest(given.posthog._send_request, {
                token: 'testtoken',
                distinct_id: 'distinctid',
                groups: { organization: '5' },
                person_properties: { key: 'value' },
                group_properties: { organization: { orgName: 'orgValue' } },
                disable_flags: true,
            })
        })

        it('should disable compression when config is set', () => {
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
                disable_compression: true,
            }))
            given.posthog.register({
                $stored_person_properties: {},
                $stored_group_properties: {},
            })
            given.subject()

            // noCompression is true
            expectDecodedSendRequest(
                given.posthog._send_request,
                {
                    token: 'testtoken',
                    distinct_id: 'distinctid',
                    groups: { organization: '5' },
                    person_properties: {},
                    group_properties: {},
                },
                true
            )
        })

        it('should send disable flags with decide request when config for advanced_disable_feature_flags_on_first_load is set', () => {
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
                advanced_disable_feature_flags_on_first_load: true,
            }))
            given.posthog.register({
                $stored_person_properties: { key: 'value' },
                $stored_group_properties: { organization: { orgName: 'orgValue' } },
            })
            given.subject()

            expectDecodedSendRequest(given.posthog._send_request, {
                token: 'testtoken',
                distinct_id: 'distinctid',
                groups: { organization: '5' },
                person_properties: { key: 'value' },
                group_properties: { organization: { orgName: 'orgValue' } },
                disable_flags: true,
            })
        })
    })

    describe('parseDecideResponse', () => {
        given('subject', () => () => given.decide.parseDecideResponse(given.decideResponse))

        it('properly parses decide response', () => {
            given('decideResponse', () => ({
                enable_collect_everything: true,
            }))
            given.subject()

            expect(given.posthog.sessionRecording.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)
            expect(given.posthog.toolbar.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)
            expect(given.posthog.featureFlags.receivedFeatureFlags).toHaveBeenCalledWith(given.decideResponse, false)
            expect(given.posthog._afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)
            expect(autocapture.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse, given.posthog)
        })

        it('Make sure receivedFeatureFlags is called with errors if the decide response fails', () => {
            given('decideResponse', () => undefined)
            window.POSTHOG_DEBUG = true
            console.error = jest.fn()

            given.subject()

            expect(given.posthog.featureFlags.receivedFeatureFlags).toHaveBeenCalledWith({}, true)
            expect(console.error).toHaveBeenCalledWith('[PostHog.js]', 'Failed to fetch feature flags from PostHog.')
        })

        it('Make sure receivedFeatureFlags is not called if advanced_disable_feature_flags_on_first_load is set', () => {
            given('decideResponse', () => ({
                enable_collect_everything: true,
                featureFlags: { 'test-flag': true },
            }))
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
                advanced_disable_feature_flags_on_first_load: true,
            }))

            given.subject()

            expect(autocapture.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse, given.posthog)
            expect(given.posthog.sessionRecording.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)
            expect(given.posthog.toolbar.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)

            expect(given.posthog.featureFlags.receivedFeatureFlags).not.toHaveBeenCalled()
        })

        it('Make sure receivedFeatureFlags is not called if advanced_disable_feature_flags is set', () => {
            given('decideResponse', () => ({
                enable_collect_everything: true,
                featureFlags: { 'test-flag': true },
            }))
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
                advanced_disable_feature_flags: true,
            }))

            given.subject()

            expect(autocapture.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse, given.posthog)
            expect(given.posthog.sessionRecording.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)
            expect(given.posthog.toolbar.afterDecideResponse).toHaveBeenCalledWith(given.decideResponse)

            expect(given.posthog.featureFlags.receivedFeatureFlags).not.toHaveBeenCalled()
        })

        it('runs site apps if opted in', () => {
            given('config', () => ({ api_host: 'https://test.com', opt_in_site_apps: true, persistence: 'memory' }))
            given('decideResponse', () => ({ siteApps: [{ id: 1, url: '/site_app/1/tokentoken/hash/' }] }))
            given.subject()
            expect(checkScriptsForSrc('https://test.com/site_app/1/tokentoken/hash/')).toBe(true)
        })

        it('does not run site apps code if not opted in', () => {
            window.POSTHOG_DEBUG = true
            given('config', () => ({ api_host: 'https://test.com', opt_in_site_apps: false, persistence: 'memory' }))
            given('decideResponse', () => ({ siteApps: [{ id: 1, url: '/site_app/1/tokentoken/hash/' }] }))
            expect(() => {
                given.subject()
            }).toThrow(
                // throwing only in tests, just an error in production
                'Unexpected console.error: [PostHog.js],PostHog site apps are disabled. Enable the "opt_in_site_apps" config to proceed.'
            )
            expect(checkScriptsForSrc('https://test.com/site_app/1/tokentoken/hash/', true)).toBe(true)
        })

        it('Make sure surveys are not loaded when decide response says no', () => {
            given('decideResponse', () => ({
                enable_collect_everything: true,
                featureFlags: { 'test-flag': true },
                surveys: false,
            }))
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
            }))

            given.subject()
            // Make sure the script is not loaded
            expect(checkScriptsForSrc('https://test.com/static/surveys.js', true)).toBe(true)
        })

        it('Make sure surveys are loaded when decide response says so', () => {
            given('decideResponse', () => ({
                enable_collect_everything: true,
                featureFlags: { 'test-flag': true },
                surveys: true,
            }))
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
            }))

            given.subject()
            // Make sure the script is loaded
            expect(checkScriptsForSrc('https://test.com/static/surveys.js')).toBe(true)
        })

        it('Make sure surveys are not loaded when config says no', () => {
            given('decideResponse', () => ({
                enable_collect_everything: true,
                featureFlags: { 'test-flag': true },
                surveys: true,
            }))
            given('config', () => ({
                api_host: 'https://test.com',
                token: 'testtoken',
                persistence: 'memory',
                disable_surveys: true,
            }))

            given.subject()
            // Make sure the script is not loaded
            expect(checkScriptsForSrc('https://test.com/static/surveys.js', true)).toBe(true)
        })
    })
})
