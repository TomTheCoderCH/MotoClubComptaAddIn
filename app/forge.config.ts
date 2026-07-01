import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'MCYCompta',
    // Ressources embarquées — copiées à côté de l'asar en production.
    // Accessibles via process.resourcesPath en prod, app.getAppPath()/resources en dev.
    extraResources: [
      { from: 'resources/fonts/',  to: 'fonts/'  },
      { from: 'resources/images/', to: 'images/' },
    ],
    executableName: 'mcy-compta',
    win32metadata: {
      CompanyName: 'MCY — Moto Club Yvorne',
      FileDescription: 'Application de comptabilité MCY',
      ProductName: 'MCY Compta',
      InternalName: 'mcy-compta',
    },
    // Custom ignore: VitePlugin's default exclude function (file => !file.startsWith('/.vite'))
    // applies to FILES inside node_modules when isModule() is false, stripping all module
    // contents and leaving only empty directories. Setting ignore here prevents VitePlugin from
    // overriding it; /node_modules/ paths return false (include) so filterFunc passes them
    // through, while @electron/packager's Pruner still excludes non-production module dirs.
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith('/.vite') || file === '/package.json') return false;
      // Include node_modules directory itself AND its contents.
      // fs.copy calls filter with '/node_modules' (no trailing slash) for the dir,
      // then '/node_modules/<pkg>/...' for its contents — both must return false (include).
      if (file === '/node_modules' || file.startsWith('/node_modules/')) return false;
      return true;
    },
  },
  rebuildConfig: {
    forceRebuild: true,
    extraModules: ['better-sqlite3'],
  },
  publishers: [
    new PublisherGithub({
      repository: { owner: 'TomTheCoderCH', name: 'MotoClubComptaAddIn' },
      prerelease: false,
      draft: false,
    }),
  ],
  makers: [
    new MakerSquirrel({
      name: 'MCYCompta',
      authors: 'Thomas Merli — MCY Moto Club Yvorne',
      setupExe: 'MCYCompta-Setup.exe',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
