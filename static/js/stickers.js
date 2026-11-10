/* Foxinix — stickers y GIFs (W28g/W36k/W60/W61/W62).

   Este módulo tiene la LÓGICA (datos, favoritos y biblioteca personal) de
   los stickers y los GIFs, sin DOM: lo usan el panel de 3 pestañas de la
   web (views/chat-shell.js) y el de la app nativa (W106).

   Lo que es sólo de interfaz (abrir el archivo, dibujar el menú) se queda
   en las vistas.

   OJO: el sticker es un EMOJI (viaja como kind 'sticker'), así que el
   favorito es el propio carácter. Los GIFs de la biblioteca son archivos
   estáticos del sitio ('/static/gifs/…'); los subidos por el usuario
   viajan como media (media_id). */

import { store, toast } from './store.js';
import { t } from './i18n.js';
import { api, uploadMedia } from './api.js';
import { StorageAdapter } from './platform/storage.js';

/* W28g: stickers (emojis grandes que viajan como kind 'sticker') y
   biblioteca local de GIFs (generados en web/gifs, subidos por el
   flujo normal de media como image/gif). */
export const STICKERS = ['👍', '🔥', '🎉', '❤️', '😂', '🤔', '👻', '🎃',
  '👏', '🙌', '💪', '☕', '🌈', '⭐', '🎯', '💌', '🤝', '😺',
  '💩', '🥶', '🥳', '😴', '🫡', '🎄'];
export const GIF_LIST = ['heart-pulse.gif', 'ball-bounce.gif', 'star-spin.gif',
  'smiley-wink.gif', 'fire.gif', 'sparkle.gif', 'confetti.gif',
  'loader.gif', 'boom-ring.gif', 'clock-spin.gif'];

/* W60: favoritos de stickers. El sticker es un emoji, así que guardar
   uno recibido (o de la biblioteca) es guardar su carácter. */
export const isStkFav = function (ch) {
  return !!(ch && (store.stkFavs || []).indexOf(ch) >= 0);
};
export const toggleStkFav = function (ch) {
  ch = ch || '';
  if (!ch) return;
  const on = isStkFav(ch);
  if (on) {
    store.stkFavs = (store.stkFavs || []).filter(function (s) { return s !== ch; });
  } else {
    store.stkFavs = [ch].concat(store.stkFavs || []);
  }
  try {
    StorageAdapter.setItem('fm.stkFavs', JSON.stringify(store.stkFavs));
  } catch (e) {}
};

/* W36k: favoritos de GIFs — la biblioteca estática (name) y los GIFs
   subidos que viajan en mensajes (media_id). Se cargan una vez al abrir
   la pestaña GIFs o al pintar una estrella; viven en store.gifFavs. */
export const ensureGifFavs = function () {
  if (store.gifFavsLoaded) return Promise.resolve();
  store.gifFavsLoaded = true;
  return api('GET', '/gifs/favorites').then(function (r) {
    store.gifFavs = (r && r.favorites) || [];
  }).catch(function () { store.gifFavsLoaded = false; });
};
/* W61: biblioteca propia de GIFs/stickers subidos (máx. 10 por tipo). */
export const ASSET_MAX = 10;
export const assetList = function (kind) {
  return kind === 'gif' ? store.userAssets.gifs : store.userAssets.stickers;
};
export const ensureUserAssets = function () {
  if (store.userAssetsLoaded) return Promise.resolve();
  store.userAssetsLoaded = true;
  return api('GET', '/assets').then(function (r) {
    store.userAssets = {
      gifs: (r && r.gifs) || [],
      stickers: (r && r.stickers) || [],
    };
  }).catch(function () { store.userAssetsLoaded = false; });
};
export const assetWithMedia = function (kind, mediaId) {
  const list = assetList(kind);
  for (let i = 0; i < list.length; i++) {
    if (list[i].media_id === mediaId) return list[i];
  }
  return null;
};
/* Sube un archivo (un File en la web, un {path} en la app nativa) y lo
   deja en la biblioteca del usuario. */
export const uploadUserAsset = async function (kind, file) {
  if (!file) return null;
  if (assetList(kind).length >= ASSET_MAX) {
    toast(kind === 'gif' ? t('Máximo 10 GIFs') : t('Máximo 10 stickers'), 'err');
    return null;
  }
  const up = await uploadMedia(file);
  const r = await api('POST', '/assets', { kind: kind, media_id: up.id });
  if (r && r.asset) {
    const list = assetList(kind).slice();
    list.unshift(r.asset);
    if (kind === 'gif') store.userAssets.gifs = list;
    else store.userAssets.stickers = list;
    return r.asset;
  }
  return null;
};
export const removeUserAsset = function (kind, asset) {
  if (!asset) return Promise.resolve();
  return api('DELETE', '/assets/' + asset.id).then(function () {
    const list = assetList(kind).filter(function (x) { return x.id !== asset.id; });
    if (kind === 'gif') store.userAssets.gifs = list;
    else store.userAssets.stickers = list;
  });
};

/* W62: un GIF puede estar guardado por media_id (subido) o por nombre
   (biblioteca). El mensaje de un GIF de biblioteca se sube con el mismo
   nombre de archivo, así que la estrella también debe reconocerlo. */
export const gifFavFor = function (m) {
  ensureGifFavs();
  const md = m && m.media;
  const fid = md ? md.id : 0;
  const fname = md && md.name ? String(md.name).toLowerCase() : '';
  const fs = store.gifFavs || [];
  for (let i = 0; i < fs.length; i++) {
    if (fid && fs[i].media_id === fid) return fs[i];
  }
  if (fname) {
    for (let j = 0; j < fs.length; j++) {
      if (fs[j].name && String(fs[j].name).toLowerCase() === fname) return fs[j];
    }
  }
  return null;
};
/* W66c: para la burbuja, un "GIF" es un gif O un WebP animado (los dos
   se guardan tal cual y el server marca animated=1). */
export const isGifMedia = function (m) {
  return !!(m && (m.mime === 'image/gif'
    || (m.mime === 'image/webp' && m.animated)));
};
export const isGifFav = function (m) {
  return !!gifFavFor(m);
};
export const isLibGifFav = function (name) {
  ensureGifFavs();
  const fs = store.gifFavs || [];
  for (let i = 0; i < fs.length; i++) if (fs[i].name === name) return true;
  return false;
};
export const toggleFavGif = function (m) {
  const md = m && m.media;
  const fid = md ? md.id : 0;
  if (!fid) return;
  const fname = md && md.name ? String(md.name).toLowerCase() : '';
  const matches = (store.gifFavs || []).filter(function (f) {
    if (fid && f.media_id === fid) return true;
    return !!(fname && f.name && String(f.name).toLowerCase() === fname);
  });
  const reqs = matches.length
    ? matches.map(function (f) {
        return api('DELETE', '/gifs/favorites',
          f.media_id ? { media_id: f.media_id } : { name: f.name });
      })
    : [api('POST', '/gifs/favorites', { media_id: fid })];
  return Promise.all(reqs).then(function () {
    if (matches.length) {
      store.gifFavs = (store.gifFavs || []).filter(function (f) {
        return matches.indexOf(f) < 0;
      });
    } else {
      store.gifFavs.unshift({ media_id: fid, name: '', url: md.url });
    }
  }).catch(function () { toast('No se pudo guardar el favorito', 'err'); });
};
export const toggleLibGif = function (name) {
  const on = isLibGifFav(name);
  return api(on ? 'DELETE' : 'POST', '/gifs/favorites', { name: name })
    .then(function () {
      if (on) {
        store.gifFavs = store.gifFavs.filter(function (f) {
          return f.name !== name;
        });
      } else {
        store.gifFavs.unshift({ media_id: 0, name: name,
          url: '/static/gifs/' + name });
      }
    })
    .catch(function () { toast('No se pudo guardar el favorito', 'err'); });
};
