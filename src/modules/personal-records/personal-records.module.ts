import { Module } from "@nestjs/common";
import { PersonalRecordsService } from "./personal-records.service";

@Module({
    providers: [PersonalRecordsService],
    exports: [PersonalRecordsService]
})
export class PersonalRecordsModule {}
