import PlaylistLibrary from "@/libraries/playlist/PlaylistLibrary";
import {
  PlaylistLocal,
  PlaylistLocalMap,
  PlaylistValidMap,
} from "@/libraries/playlist/PlaylistLocal";
import { BeatmapsTableDataUnit } from "@/components/beatmap/table/core/BeatmapsTableDataUnit";
import BeatsaverCachedLibrary from "@/libraries/beatmap/repo/BeatsaverCachedLibrary";
import Logger from "@/libraries/helper/Logger";
import BeatmapLibrary from "../beatmap/BeatmapLibrary";
import { BeatmapLocal } from "../beatmap/BeatmapLocal";
import { BeatsaverBeatmap } from "../net/beatsaver/BeatsaverBeatmap";

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
    const validMaps = playlist.maps.filter((map) => {
      // console.log(map.hash);
      return map.hash !== undefined;
    }) as PlaylistValidMap[];

    Logger.debug(`    start GetAllValidMap`, "PlaylistMapsLibrary");
    const localValidMaps = BeatmapLibrary.GetAllValidMap();
    const result: BeatmapsTableDataUnit[] = [];
    const promiseResults: Promise<{
      local: BeatmapLocal;
      data: BeatsaverBeatmap | undefined;
      folderNameHash: string | undefined;
    }>[] = [];
    Logger.debug(
      `    start validMaps loop ${validMaps.length}`,
      "PlaylistMapsLibrary"
    );
    const validCache = BeatsaverCachedLibrary.GetAllValid();
    for (const playlistMap of validMaps) {
      const playlistMapHash = playlistMap.hash.toUpperCase();
      // const mydata = BeatsaverCachedLibrary.GetByHash(playlistMapHash)?.beatmap;
      const mydata = validCache.get(playlistMapHash)?.beatmap;
      if (mydata != null) {
        result.push({
          local: undefined,
          data: mydata,
          folderNameHash: undefined,
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
        }>((resolve) => {
          BeatmapLibrary.GenerateBeatmap(beatmapLocal).then((generatedMap) => {
            resolve({
              local: beatmapLocal as BeatmapLocal,
              data: generatedMap,
              folderNameHash,
            });
          });
        })
      );
    }
    Logger.debug(
      `    end   validMaps loop ${validMaps.length}`,
      "PlaylistMapsLibrary"
    );
    Logger.debug(`    start promise.all`, "PlaylistMapsLibrary");
    const resolved = await Promise.all(promiseResults);
    Logger.debug(`    end   promise.all`, "PlaylistMapsLibrary");
    return result.concat(
      resolved.filter((item) => item.data != null) as BeatmapsTableDataUnit[]
    );
    /*
    return validMaps
      .map((playlistMap: PlaylistValidMap) => {
        let mydata = BeatsaverCachedLibrary.GetByHash(playlistMap.hash)
          ?.beatmap;
        let beatmapLocal;
        if (mydata == null) {
          // console.log(`mydata == null`);
          beatmapLocal = BeatmapLibrary.GetAllMaps().find(
            (item) =>
              item.hash?.toUpperCase() === playlistMap.hash.toUpperCase()
          );
          // console.log(beatmapLocal?.folderPath);
          if (beatmapLocal != null) {
            mydata = BeatmapLibrary.GenerateBeatmap(beatmapLocal);
          }
        }
        return {
          local: beatmapLocal,
          data: mydata,
        };
      })
      .filter((unit) => unit.data !== undefined) as BeatmapsTableDataUnit[];
    */
  }
}
