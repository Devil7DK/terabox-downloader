declare module '@root/file-cookie-store' {
    import { Store } from 'tough-cookie';

    type Callback = (err: Error | null) => void;

    interface FileCookieStoreOptions {
        force_parse?: boolean;
        lockfile?: boolean;
        mode?: number;
        http_only_extension?: boolean;
        lockfile_retries?: number;
        auto_sync?: boolean;
        no_file_error?: boolean;
    }

    class FileCookieStore extends Store {
        file: string;
        force_parse: boolean;
        lockfile: boolean;
        mode: number;
        http_only_extension: boolean;
        lockfile_retries: number;
        auto_sync: boolean;
        no_file_error: boolean;
        synchronous: true;

        constructor(file: string, opts?: FileCookieStoreOptions);

        idx: any;

        inspect(): string;

        _readFile(cb: Callback): void;
        _read(cb: Callback): void;
        _get_lock_func(disable_lock: boolean): void;
        _get_unlock_func(disable_lock: boolean): void;
        _write(options: { disable_lock?: boolean }, cb?: Callback): void;
        _update(updateFunc: () => void, cb: Callback): void;
        serialize(idx: any): string;
    }

    export = FileCookieStore;
}
