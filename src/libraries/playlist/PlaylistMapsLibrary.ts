import PlaylistLibrary from "@/libraries/playlist/PlaylistLibrary";
import {
  PlaylistLocal,
  PlaylistLocalMap,
  PlaylistValidMap,
  PlaylistMap,
} from "@/libraries/playlist/PlaylistLocal";
import { BeatmapsTableDataUnit } from "@/components/beatmap/table/core/BeatmapsTableDataUnit";
import BeatsaverCachedLibrary from "@/libraries/beatmap/repo/BeatsaverCachedLibrary";
import Logger from "@/libraries/helper/Logger";
import BeatmapLibrary from "../beatmap/BeatmapLibrary";
import { BeatmapLocal } from "../beatmap/BeatmapLocal";
import {
  BeatsaverBeatmap,
  DifficultiesSimple,
} from "../net/beatsaver/BeatsaverBeatmap";

export default class PlaylistMapsLibrary {
  public static GetAllInvalidMap(): {
    playlist: PlaylistLocal;
    invalids: PlaylistLocalMap[];
  }[] {
    return PlaylistLibrary.GetAllPlaylists().map((playlist) => ({
      playlist,
      invalids: this.GetAllInvalidMapFor(playlist),
    }));
  }

  public static GetAllInvalidMapFlatten(): {
    playlist: PlaylistLocal;
    map: PlaylistLocalMap;
  }[] {
    return this.GetAllInvalidMap().reduce(
      (previous: any[], current) =>
        previous.concat(
          ...current.invalids.map((invalid) => ({
            playlist: current.playlist,
            map: invalid,
          }))
        ),
      []
    );
  }

  public static GetAllInvalidMapFor(
    playlist: PlaylistLocal
  ): PlaylistLocalMap[] {
    return playlist.maps.filter((map) => map.error !== undefined);
  }

  public static GetAllValidMapFor(playlist: PlaylistLocal): PlaylistValidMap[] {
    return playlist.maps.filter(
      (map) => map.error === undefined && map.hash !== undefined
    ) as PlaylistValidMap[];
  }

  public static async GetAllValidMapAsTableDataFor(
    playlist: PlaylistLocal
  ): Promise<BeatmapsTableDataUnit[]> {
    /*
    return this.GetAllValidMapFor(playlist)
      .map((playlistMap: PlaylistValidMap) => ({
        data: BeatsaverCachedLibrary.GetByHash(playlistMap.hash)?.beatmap,
      }))
      .filter((unit) => unit.data !== undefined) as BeatmapsTableDataUnit[];
    */
    Logger.debug(`start GetAllValidMapAsTableDataFor`, "PlaylistMapsLibrary");
    // const validMaps = playlist.maps.filter((map) => {
    //   return map.hash !== undefined;
    // }) as PlaylistValidMap[];

    Logger.debug(`    start GetAllValidMap`, "PlaylistMapsLibrary");
    const localValidMaps = BeatmapLibrary.GetAllValidMap();
    const result: BeatmapsTableDataUnit[] = [];
    const promiseResults: Promise<{
      local: BeatmapLocal;
      data: BeatsaverBeatmap | undefined;
      folderNameHash: string | undefined;
      playlistMapIndex: number | undefined;
      diffHighlight: { [key: string]: DifficultiesSimple } | undefined;
    }>[] = [];
    Logger.debug(
      `    start playlistMaps loop ${playlist.maps.length}`,
      "PlaylistMapsLibrary"
    );
    const duplicatedHashSet = this.GetDuplicatedHashSet(playlist.maps);

    const validCache = BeatsaverCachedLibrary.GetAllValid();

    for (let idx = 0; idx < playlist.maps.length; idx += 1) {
      const playlistMap = playlist.maps[idx];
      if (playlistMap.hash == null) {
        // 無効な map は除外
        // eslint-disable-next-line no-continue
        continue;
      }
      const playlistMapHash = playlistMap.hash.toUpperCase();
      const duplicated = duplicatedHashSet.has(playlistMapHash);
      const diffHighlight = this.GetDiffHighlight(playlistMap);

      // const mydata = BeatsaverCachedLibrary.GetByHash(playlistMapHash)?.beatmap;
      const mydata = validCache.get(playlistMapHash)?.beatmap;
      if (mydata != null) {
        result.push({
          local: undefined,
          data: mydata,
          folderNameHash: undefined,
          duplicated,
          playlistMapIndex: idx,
          diffHighlight,
        });
        // eslint-disable-next-line no-continue
        continue;
      }
      const beatmapLocal = localValidMaps.find(
        (item) => item.hash?.toUpperCase() === playlistMapHash
      );
      if (beatmapLocal == null) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const folderNameHash = BeatmapLibrary.getFolderNameHash(
        beatmapLocal.folderPath
      );
      promiseResults.push(
        new Promise<{
          local: BeatmapLocal;
          data: BeatsaverBeatmap | undefined;
          folderNameHash: string | undefined;
          duplicated: boolean | undefined;
          playlistMapIndex: number | undefined;
          diffHighlight: { [key: string]: DifficultiesSimple } | undefined;
        }>((resolve) => {
          BeatmapLibrary.GenerateBeatmap(beatmapLocal)
            .then((generatedMap) => {
              resolve({
                local: beatmapLocal as BeatmapLocal,
                data: generatedMap,
                folderNameHash,
                duplicated,
                playlistMapIndex: idx,
                diffHighlight,
              });
            })
            .catch((error: any) => {
              console.warn(error);
              resolve({
                local: beatmapLocal as BeatmapLocal,
                data: undefined,
                folderNameHash,
                duplicated,
                playlistMapIndex: idx,
                diffHighlight,
              });
            });
        })
      );
    }
    Logger.debug(
      `    end   playlistMaps loop ${playlist.maps.length}`,
      "PlaylistMapsLibrary"
    );
    Logger.debug(`    start promise.all`, "PlaylistMapsLibrary");
    const resolved = await Promise.all(promiseResults);
    Logger.debug(`    end   promise.all`, "PlaylistMapsLibrary");
    return result.concat(
      resolved.filter((item) => item.data != null) as BeatmapsTableDataUnit[]
    );
  }

  public static GetDuplicatedHashSet(
    localMaps: PlaylistLocalMap[]
  ): Set<string> {
    const hashSet = new Set<string>();
    const duplicatedHashSet = new Set<string>();
    for (const playlistMap of localMaps) {
      if (playlistMap.hash == null) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const playlistMapHash = playlistMap.hash.toUpperCase();
      if (hashSet.has(playlistMapHash)) {
        duplicatedHashSet.add(playlistMapHash);
      }
      hashSet.add(playlistMapHash);
    }
    return duplicatedHashSet;
  }

  public static GetDiffHighlight(playlistMap: PlaylistMap) {
    if (playlistMap.originalData?.difficulties == null) {
      return undefined;
    }
    const result = {} as { [key: string]: DifficultiesSimple };
    for (const diff of playlistMap.originalData.difficulties) {
      if (diff.characteristic != null && diff.name != null) {
        const characteristic = diff.characteristic.toLowerCase();
        if (result[characteristic] == null) {
          result[characteristic] = {} as DifficultiesSimple;
        }
        const name = diff.name.toLowerCase();
        switch (name) {
          case "easy":
            result[characteristic].easy = true;
            break;
          case "normal":
            result[characteristic].normal = true;
            break;
          case "hard":
            result[characteristic].hard = true;
            break;
          case "expert":
            result[characteristic].expert = true;
            break;
          case "expertplus":
            result[characteristic].expertPlus = true;
            break;

          default:
            break;
        }
      }
    }
    return result;
  }

  public static GetMapHashesByIndex(
    playlist: PlaylistLocal,
    indexes: Number[]
  ) {
    if (playlist != null && indexes != null) {
      const hashSet = new Set<string>();
      for (let idx = 0; idx < playlist.maps.length; idx += 1) {
        if (indexes.includes(idx)) {
          const playlistMap = playlist.maps[idx];
          if (playlistMap?.hash != null) {
            const hash = playlistMap.hash.toUpperCase();
            hashSet.add(hash);
          }
        }
      }
      return Array.from(hashSet);
    }
    return [];
  }
}
