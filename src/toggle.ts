import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as sourcemap from 'source-map';
import * as assert from 'assert';
const StripJsonComments = require('strip-json-comments') as Function;

const ENCODING = "utf8";
const TSCONFIG = "tsconfig.json";

interface TSconfigOpthons {
    readonly compilerOptions?: TSCompilerOptions;
}

interface TSCompilerOptions {
    [key: string]: any;
    readonly inlineSourceMap: boolean;
    readonly inlineSources: boolean;
    readonly mapRoot: string;
    readonly outDir: string;
    readonly rootDir: string;
    readonly rootDirs: string[];
    readonly sourceMap: boolean;
    readonly sourceRoot: string;
}

export interface RawPosition {
    readonly line: number;
    readonly column: number;
}

export interface FindFilePos {
    file: string;
    postion: RawPosition;
}

const TSDefaultOptions: TSCompilerOptions = {
    inlineSourceMap: false,
    inlineSources: false,
    mapRoot: "./",
    outDir: "./",
    rootDir: "./",
    rootDirs: [],
    sourceMap: false,
    sourceRoot: "./",
};


export class TSJSToggle {
    private _pos: RawPosition | undefined;
    private _curfile: string = "";
    private _curdir: string = "";
    private _rootdir: string = "";
    private _tscfgpath: string = "";
    private _ists: boolean = false;
    private _isjs: boolean = false;
    private _mapdata: sourcemap.RawSourceMap | undefined;
    private _tscfgdata: TSCompilerOptions = TSDefaultOptions;

    public Init(filepath: string, pos: RawPosition) {
        this._pos = pos;
        this._curfile = filepath;
        this._curdir = path.dirname(filepath);

        if (path.extname(this._curfile) === ".ts") {
            this._ists = true;
            this._isjs = false;
        } else {
            this._ists = false;
            this._isjs = true;
        }

        this._rootdir = searchRootPath(this._curdir);

        if (this._rootdir) {
            this._tscfgpath = path.join(this._rootdir, TSCONFIG);
        }
    }

    private get tsfilepath(): string {
        if (this._ists) {
            return this._curfile;
        }
        if (this._mapdata) {
            if (this._mapdata.sourceRoot) {
                return path.join(this._mapdata.sourceRoot, this._mapdata.sources[0]);
            }
            return path.join(this._curdir, this._mapdata.sources[0]);
        }
        if (this._rootdir) {
            const jsdir = path.join(this._rootdir, this._tscfgdata.outDir);
            const tsdir = path.join(this._rootdir, this._tscfgdata.rootDir);
            if (this._curfile.startsWith(jsdir)) {
                return path.join(tsdir, this._curdir.slice(jsdir.length), path.basename(this._curfile).slice(0, -3) + ".ts");
            }
        }
        const trysamepath = path.join(this._curdir, path.basename(this._curfile).slice(0, -3) + ".ts");
        return trysamepath;

    }

    private get jsfilepath(): string {
        if (this._isjs) {
            return this._curfile;
        }
        if (this._rootdir) {
            const jsdir = path.join(this._rootdir, this._tscfgdata.outDir);
            const tsdir = path.join(this._rootdir, this._tscfgdata.rootDir);
            if (this._curfile.startsWith(tsdir)) {
                return path.join(jsdir, this._curdir.slice(tsdir.length), path.basename(this._curfile).slice(0, -3) + ".js");
            }
        }
        const trysamepath = path.join(this._curdir, path.basename(this._curfile).slice(0, -3) + ".js");
        return trysamepath;
    }

    private async loadJSON(): Promise<boolean> {
        // try load tsconfig.json
        var tsconfig: TSconfigOpthons | undefined = undefined;
        if (this._tscfgpath) {
            try {
                tsconfig = await parseJsonFile<TSconfigOpthons>(this._tscfgpath);
            } catch (err) {
                console.error("parse tsconfig.json faild");
            }
        }
        if (tsconfig && tsconfig.compilerOptions) {
            for (let key in tsconfig.compilerOptions) {
                this._tscfgdata[key] = tsconfig.compilerOptions[key];
            }
        } else {
            console.error("lose tsconfig or lose tsconfig.compilerOptions");
        }

        // try load js.map file
        const js = this.jsfilepath;
        if (fs.existsSync(js)) {
            try {
                this._mapdata = await parseJsonFile<sourcemap.RawSourceMap>(js + ".map");
                if (this._mapdata) {
                    return true;
                } else {
                    console.error("parse *.js.map file failed 1");
                }
            } catch{
                console.error("parse *.js.map file failed 2");
            }

        }
        return false;
    }

    public async GetSwitchPosition(cbfunc?: (result: FindFilePos | undefined) => void): Promise<FindFilePos | undefined> {
        const loadok = await this.loadJSON();
        if (!loadok || !this._mapdata || !this._pos) {
            console.error(`init faild,err info:loadok=${loadok},mapdata=${this._mapdata},pos=${this._pos}`);
            let filename = "";
            if (this._ists) {
                filename = this.jsfilepath;
            } else {
                filename = this.tsfilepath;
            }
            const data = { file: filename, postion: { line: 0, column: 0 } };
            if (cbfunc) {
                cbfunc(data);
            }
            return;
        }
        var consumer: sourcemap.SourceMapConsumer;
        try {
            consumer = await new sourcemap.SourceMapConsumer(this._mapdata as sourcemap.RawSourceMap);
        } catch (err) {
            console.error("sourcemap.SourceMapConsumer create failed");
            if (err && cbfunc) {
                cbfunc(undefined);
            }
            return;
        }
        var ret: FindFilePos;
        var posinfo;
        if (this._ists) {
            const opts: sourcemap.SourceFindPosition = {
                source: this._mapdata.sources[0],
                line: this._pos.line,
                column: this._pos.column
            };

            try {
                posinfo = consumer.generatedPositionFor(opts);
                assert(posinfo.column && posinfo.line);
            } catch{// consumer has some error.I haven't solved it perfectly. so catch...
                posinfo = { line: 0, column: 0 };
            }

            ret = {
                file: this.jsfilepath,
                postion: { line: posinfo.line, column: posinfo.column }
            };
        } else {
            try {
                posinfo = consumer.originalPositionFor(this._pos);
                assert(posinfo.column && posinfo.line);
            } catch{// consumer has some error.I haven't solved it perfectly. so catch...
                try {
                    posinfo = consumer.originalPositionFor({ line: this._pos.line, column: 0xfffffff });
                } catch{
                    posinfo = { line: 0, column: 0 };
                }
            }
            ret = {
                file: this.tsfilepath,
                postion: { line: posinfo.line, column: posinfo.column }
            };
        }
        if (cbfunc) {
            cbfunc(ret);
        }
        return ret;
    }
}


function searchRootPath(curdir: string): string {
    if (vscode.workspace.rootPath && curdir.startsWith(vscode.workspace.rootPath)) {
        if (fs.existsSync(path.join(vscode.workspace.rootPath, "tsconfig.json"))) {
            return vscode.workspace.rootPath;
        }
    }
    if (fs.existsSync(path.join(curdir, "tsconfig.json"))) {
        return curdir;
    }
    const searchDeep = 16;
    let tspath = "";
    let temppath = "";
    for (let i = 0; i < searchDeep; ++i) {
        tspath = path.join(curdir, "tsconfig.json");
        if (fs.existsSync(tspath)) {
            return curdir;
        } else {
            temppath = curdir;
            curdir = path.dirname(curdir);
            if (curdir === temppath) {
                return "";
            }
        }
    }
    return "";
}


function parseJsonFile<T>(tspath: string): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
        fs.readFile(tspath, ENCODING, (err, data) => {
            if (err) {
                resolve(undefined);
            } else {
                try {
                    let temp = StripJsonComments(data);
                    let obj: T = JSON.parse(temp);
                    resolve(obj);
                } catch (e) {
                    resolve(undefined);
                }
            }
        });
    });
}

