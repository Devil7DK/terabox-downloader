export type TeraBoxFile = {
    filename: string;
    fs_id: string;
    size: string;
    category: string;
    children: TeraBoxFile[];
    create_time: string;
    is_dir: string;
};
