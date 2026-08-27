import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WeeklyDashboardRepository } from './weekly-dashboard.repository';
import { SaveWeeklyReportDto } from './dto/save-weekly-report.dto';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class WeeklyDashboardService {
  constructor(
    private readonly repository: WeeklyDashboardRepository,
    private readonly organizationService: OrganizationService,
  ) {}

  async findReports(teamId: string) {
    if (!(await this.repository.teamExists(teamId))) {
      throw new NotFoundException('Team not found');
    }
    return this.repository.findReports(teamId);
  }

  async findReport(teamId: string, reportId: string) {
    const report = await this.repository.findReport(teamId, reportId);
    if (!report) throw new NotFoundException('Weekly report not found');
    return report;
  }

  async findContext(teamId: string, requestedWeekStart?: string) {
    const weekStart =
      requestedWeekStart ?? new Date().toISOString().slice(0, 10);
    const weekEndDate = new Date(`${weekStart}T00:00:00.000Z`);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const [organization, sprints] = await Promise.all([
      this.organizationService.findTeamOrganization(teamId),
      this.repository.findSprintsForWeek(teamId, weekStart, weekEnd),
    ]);
    const assignments = organization.assignments.filter(
      (assignment) =>
        assignment.startedAt <= weekEnd &&
        (!assignment.endedAt || assignment.endedAt >= weekStart),
    );
    return {
      team: organization.team,
      weekStart,
      weekEnd,
      assignments,
      sprints,
    };
  }

  async saveReport(teamId: string, input: SaveWeeklyReportDto) {
    if (!(await this.repository.teamExists(teamId))) {
      throw new NotFoundException('Team not found');
    }
    if (
      new Date(input.weekEnd).getTime() < new Date(input.weekStart).getTime()
    ) {
      throw new BadRequestException('weekEnd cannot be earlier than weekStart');
    }
    for (const initiative of input.initiatives) {
      const start = new Date(initiative.startDate).getTime();
      if (
        initiative.plannedEndDate &&
        new Date(initiative.plannedEndDate).getTime() < start
      ) {
        throw new BadRequestException(
          `Initiative "${initiative.name}" has an invalid plannedEndDate`,
        );
      }
      if (
        initiative.actualEndDate &&
        new Date(initiative.actualEndDate).getTime() < start
      ) {
        throw new BadRequestException(
          `Initiative "${initiative.name}" has an invalid actualEndDate`,
        );
      }
    }
    const reportId = await this.repository.saveReport({ teamId, ...input });
    const report = await this.repository.findReport(teamId, reportId);
    if (!report)
      throw new NotFoundException('Saved weekly report could not be read');
    return report;
  }
}
