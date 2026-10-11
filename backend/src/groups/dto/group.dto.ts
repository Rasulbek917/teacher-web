import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1, { message: 'Guruh nomi majburiy' })
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(40)
  level: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta dars kuni tanlang' })
  @IsInt({ each: true })
  @Min(1, { each: true, message: "Dars kuni 1..7 bo'lishi kerak" })
  @Max(7, { each: true })
  lessonDays: number[];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Dars soati HH:mm ko\'rinishida bo\'lishi kerak',
  })
  lessonTime: string;

  @IsInt({ message: "Oylik narx butun son bo'lishi kerak" })
  @Min(0)
  monthlyPrice: number;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  level?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  lessonDays?: number[];

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  lessonTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number;
}
