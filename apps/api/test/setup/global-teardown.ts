import * as infrastructure from './infrastructure';

/**
 * Stops the containers started by `global-setup.ts`.
 *
 * Jest runs global teardown in its own process, so it cannot receive values from setup.
 * Everything needed to stop a container is held by the testcontainers runtime, so this
 * simply calls the same teardown. Containers are also reclaimed on exit by
 * `testcontainers`' Ryuk sidecar, so a crashed run does not leave them running.
 */
export default infrastructure.globalTeardown;
